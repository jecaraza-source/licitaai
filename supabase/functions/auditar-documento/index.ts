// LicitaAI — Sprint 6: auditar-documento

import { createClient } from "jsr:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@^0.68";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { withRetry } from "../_shared/retry.ts";
import { getEmpresaPerfilActiva } from "../_shared/empresa-perfil.ts";

const SYSTEM_PROMPT = `Eres un auditor experto en documentación legal y fiscal para licitaciones
públicas mexicanas. Verifica el documento adjunto contra el requisito esperado y los datos
de la empresa. Sé estricto: si algo no se puede confirmar en el documento, repórtalo como
observación en vez de asumirlo válido. Usa siempre la herramienta proporcionada.`;

const TOOL_SCHEMA = {
  type: "object" as const,
  properties: {
    valido: { type: "boolean" },
    observaciones: { type: "array", items: { type: "string" } },
    nivel_riesgo: { type: "string", enum: ["VERDE", "AMARILLO", "ROJO"] },
    campos_detectados: {
      type: "object",
      properties: {
        rfc: { type: ["string", "null"] },
        razon_social: { type: ["string", "null"] },
        fecha_emision: { type: ["string", "null"] },
        fecha_vigencia: { type: ["string", "null"] },
        representante_legal: { type: ["string", "null"] },
        tiene_firma_o_sello: { type: ["boolean", "null"] },
      },
      required: [
        "rfc",
        "razon_social",
        "fecha_emision",
        "fecha_vigencia",
        "representante_legal",
        "tiene_firma_o_sello",
      ],
      additionalProperties: false,
    },
  },
  required: ["valido", "observaciones", "nivel_riesgo", "campos_detectados"],
  additionalProperties: false,
};

function uint8ArrayToBase64(bytes: Uint8Array): string {
  const CHUNK = 8192;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const { documento_id, checklist_item_id } = await req.json();
    if (!documento_id) {
      return new Response(JSON.stringify({ error: "documento_id requerido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

    const { data: documento, error: docError } = await supabase
      .from("documentos")
      .select("id, nombre, storage_path, licitacion_id")
      .eq("id", documento_id)
      .single();
    if (docError || !documento) throw new Error("Documento no encontrado");

    const [{ data: licitacion }, { data: checklistItem }] = await Promise.all([
      supabase
        .from("licitaciones")
        .select("fecha_entrega_propuesta, organization_id, created_by")
        .eq("id", documento.licitacion_id)
        .single(),
      checklist_item_id
        ? supabase
            .from("checklist_items")
            .select("descripcion, categoria, fundamento_legal, vigencia_requerida")
            .eq("id", checklist_item_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const empresa = await getEmpresaPerfilActiva(
      supabase,
      licitacion?.organization_id,
      licitacion?.created_by,
    );

    const { data: archivo, error: downloadError } = await supabase.storage
      .from("documentos-requeridos")
      .download(documento.storage_path);
    if (downloadError || !archivo) throw new Error("No se pudo descargar el documento");

    const base64 = uint8ArrayToBase64(new Uint8Array(await archivo.arrayBuffer()));
    const mediaType = documento.nombre.toLowerCase().endsWith(".pdf")
      ? "application/pdf"
      : "image/jpeg";

    const contexto = `
Requisito esperado: ${checklistItem?.descripcion ?? "Documento general"} (categoría: ${checklistItem?.categoria ?? "N/D"})
Fundamento legal: ${checklistItem?.fundamento_legal ?? "N/D"}
Vigencia requerida: ${checklistItem?.vigencia_requerida ?? "N/D"}
Fecha de entrega de propuesta (para validar vigencia): ${licitacion?.fecha_entrega_propuesta ?? "N/D"}

Datos de la empresa participante (deben coincidir si el documento los menciona):
Razón social: ${empresa?.razon_social ?? "N/D"}
RFC: ${empresa?.rfc ?? "N/D"}
`.trim();

    const response = await withRetry(() =>
      anthropic.messages.create({
        model: "claude-sonnet-5",
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        tools: [
          {
            name: "reportar_auditoria",
            description: "Reporta el resultado de la auditoría del documento",
            input_schema: TOOL_SCHEMA,
          },
        ],
        tool_choice: { type: "tool", name: "reportar_auditoria" },
        messages: [
          {
            role: "user",
            content: [
              { type: "document", source: { type: "base64", media_type: mediaType, data: base64 } },
              { type: "text", text: contexto },
            ],
          },
        ],
      }),
    );

    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    const auditoria = toolUse?.input as
      | { valido: boolean; observaciones: string[]; nivel_riesgo: string; campos_detectados: unknown }
      | undefined;

    if (!auditoria) throw new Error("No se pudo generar la auditoría");

    await supabase.from("documentos").update({ auditoria_json: auditoria }).eq("id", documento_id);

    if (checklist_item_id) {
      await supabase
        .from("checklist_items")
        .update({
          documento_id,
          estado: auditoria.valido ? "COMPLETO" : "PENDIENTE",
        })
        .eq("id", checklist_item_id);
    }

    await supabase.from("actividad_log").insert({
      licitacion_id: documento.licitacion_id,
      accion: "auditoria_documento",
      metadata_json: { documento_id, nivel_riesgo: auditoria.nivel_riesgo },
    });

    return new Response(JSON.stringify({ ok: true, data: auditoria }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error(error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Error desconocido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
