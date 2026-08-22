// LicitaAI — Sprint 6: auditar-expediente
//
// Revisión cruzada: compara los campos detectados en todos los documentos
// auditados del expediente (RFC, razón social, vigencias) y genera una
// lista de pendientes críticos vs advertencias.

import { createClient } from "jsr:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@^0.68";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { withRetry } from "../_shared/retry.ts";

const SYSTEM_PROMPT = `Eres un auditor experto en expedientes de licitaciones públicas mexicanas.
Recibes los resultados de auditoría individual de cada documento de un expediente.
Verifica consistencia cruzada: mismo RFC y razón social en todos los documentos que los mencionan,
representante legal consistente, y vigencias válidas para la fecha de entrega de propuesta.
Clasifica cada hallazgo como pendiente crítico (bloqueador para participar) o advertencia (riesgo menor).
Usa siempre la herramienta proporcionada.`;

const TOOL_SCHEMA = {
  type: "object" as const,
  properties: {
    resumen: { type: "string" },
    pendientes_criticos: {
      type: "array",
      items: {
        type: "object",
        properties: {
          descripcion: { type: "string" },
          dias_estimados: { type: ["number", "null"] },
        },
        required: ["descripcion", "dias_estimados"],
        additionalProperties: false,
      },
    },
    advertencias: { type: "array", items: { type: "string" } },
  },
  required: ["resumen", "pendientes_criticos", "advertencias"],
  additionalProperties: false,
};

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const { licitacion_id } = await req.json();
    if (!licitacion_id) {
      return new Response(JSON.stringify({ error: "licitacion_id requerido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

    const { data: licitacion } = await supabase
      .from("licitaciones")
      .select("fecha_entrega_propuesta")
      .eq("id", licitacion_id)
      .single();

    const { data: checklistItems } = await supabase
      .from("checklist_items")
      .select("descripcion, categoria, estado, requerido, documento_id, documentos(nombre, auditoria_json)")
      .eq("licitacion_id", licitacion_id);

    if (!checklistItems || checklistItems.length === 0) {
      return new Response(
        JSON.stringify({ error: "No hay checklist para esta licitación" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const contexto = `
Fecha de entrega de propuesta: ${licitacion?.fecha_entrega_propuesta ?? "N/D"}

Checklist y auditorías de documentos:
${JSON.stringify(checklistItems, null, 2)}
`.trim();

    const response = await withRetry(() =>
      anthropic.messages.create({
        model: "claude-sonnet-5",
        max_tokens: 4000,
        system: SYSTEM_PROMPT,
        tools: [
          {
            name: "reportar_auditoria_expediente",
            description: "Reporta el resultado de la auditoría cruzada del expediente",
            input_schema: TOOL_SCHEMA,
          },
        ],
        tool_choice: { type: "tool", name: "reportar_auditoria_expediente" },
        messages: [{ role: "user", content: contexto }],
      }),
    );

    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    const reporte = toolUse?.input ?? { resumen: "", pendientes_criticos: [], advertencias: [] };

    await supabase.from("actividad_log").insert({
      licitacion_id,
      accion: "auditoria_expediente",
      metadata_json: reporte as Record<string, unknown>,
    });

    return new Response(JSON.stringify({ ok: true, data: reporte }), {
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
