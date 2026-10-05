// LicitaAI — Sprint 6: auditar-documento

import Anthropic from "npm:@anthropic-ai/sdk@^0.68";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { withRetry } from "../_shared/retry.ts";
import { getEmpresaPerfilActiva } from "../_shared/empresa-perfil.ts";
import {
  authenticate,
  registrarUsoIA,
  requireChecklistItem,
  requireDocumentoById,
} from "../_shared/auth.ts";
import { resolverModelo } from "../_shared/modelo-politica.ts";
import { conGuardia } from "../_shared/ai-guard.ts";
import { bloqueDocumentoParaClaude } from "../_shared/anthropic-content-block.ts";
import {
  construirContextoAuditoria,
  estadoDesdeAuditoria,
  REGLAS_COMPARACION,
} from "../_shared/auditoria-documento.ts";

const SYSTEM_PROMPT = conGuardia(`Eres un auditor experto en documentación legal y fiscal para licitaciones
públicas mexicanas. Verifica el documento adjunto contra el requisito esperado y los datos
de la empresa. Sé estricto con el requisito: si algo no se puede confirmar en el documento,
repórtalo como observación en vez de asumirlo válido.

${REGLAS_COMPARACION}

Usa siempre la herramienta proporcionada.`);

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
    const ctx = await authenticate(req, {
      ruta: "auditar-documento",
      requiereEscritura: true,
      maxPorMinuto: 20,
      requiereIA: true,
      permitirJob: true,
    });
    if (ctx instanceof Response) return ctx;

    const { documento_id, checklist_item_id } = await req.json();
    const documento = await requireDocumentoById(ctx, documento_id);
    if (documento instanceof Response) return documento;

    let checklistItem: { descripcion: string; categoria: string; fundamento_legal: string | null; vigencia_requerida: string | null; estado: string } | null = null;
    if (checklist_item_id) {
      const item = await requireChecklistItem(ctx, checklist_item_id, documento.licitacion_id);
      if (item instanceof Response) return item;
      const { data } = await ctx.service
        .from("checklist_items")
        .select("descripcion, categoria, fundamento_legal, vigencia_requerida, estado")
        .eq("id", item.id)
        .single();
      checklistItem = data;
    }

    const supabase = ctx.service;
    const modeloIA = await resolverModelo(supabase, ctx.organizationId, "claude-sonnet-5");
    const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

    const { data: licitacion } = await supabase
      .from("licitaciones")
      .select("fecha_entrega_propuesta, organization_id, created_by")
      .eq("id", documento.licitacion_id)
      .single();

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

    const contexto = construirContextoAuditoria({
      requisito: checklistItem,
      fechaEntregaPropuesta: licitacion?.fecha_entrega_propuesta ?? null,
      empresa,
    });

    const response = await withRetry(() =>
      anthropic.messages.create({
        model: modeloIA,
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
              bloqueDocumentoParaClaude(mediaType, base64),
              { type: "text", text: contexto },
            ],
          },
        ],
      }),
    );

    await registrarUsoIA(ctx, {
      funcion: "auditar-documento",
      modelo: modeloIA,
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
    });

    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    const auditoria = toolUse?.input as
      | { valido: boolean; observaciones: string[]; nivel_riesgo: string; campos_detectados: unknown }
      | undefined;

    if (!auditoria) throw new Error("No se pudo generar la auditoría");

    await supabase.from("documentos").update({ auditoria_json: auditoria }).eq("id", documento_id);

    if (checklist_item_id) {
      // GRIS ("No aplica") es decisión de una persona: se vincula el
      // documento pero el estado no se toca (estadoDesdeAuditoria → null).
      const estado = estadoDesdeAuditoria(auditoria.valido, auditoria.nivel_riesgo, checklistItem?.estado);
      await supabase
        .from("checklist_items")
        .update(estado ? { documento_id, estado } : { documento_id })
        .eq("id", checklist_item_id);
    }

    await supabase.from("actividad_log").insert({
      licitacion_id: documento.licitacion_id,
      accion: "auditoria_documento",
      metadata_json: { documento_id, nivel_riesgo: auditoria.nivel_riesgo },
    });

    return new Response(
      JSON.stringify({ ...{ ok: true, data: auditoria }, _usage: { tokens_input: response.usage?.input_tokens ?? 0, tokens_output: response.usage?.output_tokens ?? 0, modelo: modeloIA, provider: "anthropic" } }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error(error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Error desconocido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
