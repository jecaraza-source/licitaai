// LicitaAI — Sprint 4: generar-preguntas-junta

import Anthropic from "npm:@anthropic-ai/sdk@^0.68";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { withRetry } from "../_shared/retry.ts";
import { authenticate, registrarUsoIA, requireLicitacion } from "../_shared/auth.ts";
import { resolverModelo } from "../_shared/modelo-politica.ts";
import { conGuardia } from "../_shared/ai-guard.ts";

const SYSTEM_PROMPT = conGuardia(`Eres un experto licitante con 20 años de experiencia en licitaciones públicas mexicanas.
Tu objetivo es identificar puntos ambiguos, contradictorios o poco claros en las bases
de licitación que podrían afectar la presentación de una propuesta competitiva.
Las preguntas deben ser técnicas, precisas y fundadas en la LAASSP o LOPSRM.
Genera preguntas que den ventaja estratégica al licitante.
Usa siempre la herramienta proporcionada para responder.`);

const TOOL_SCHEMA = {
  type: "object",
  properties: {
    preguntas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          texto: { type: "string" },
          categoria: {
            type: "string",
            enum: ["TECNICAS", "ADMINISTRATIVAS", "ECONOMICAS", "JURIDICAS"],
          },
          fundamento_legal: { type: ["string", "null"] },
          prioridad: { type: "string", enum: ["ALTA", "MEDIA", "BAJA"] },
          justificacion: { type: "string" },
        },
        required: ["texto", "categoria", "fundamento_legal", "prioridad", "justificacion"],
        additionalProperties: false,
      },
    },
  },
  required: ["preguntas"],
  additionalProperties: false,
};

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const ctx = await authenticate(req, {
      ruta: "generar-preguntas-junta",
      requiereEscritura: true,
      maxPorMinuto: 10,
      requiereIA: true,
      permitirJob: true,
    });
    if (ctx instanceof Response) return ctx;

    const { licitacion_id } = await req.json();
    const licitacionCheck = await requireLicitacion(ctx, licitacion_id);
    if (licitacionCheck instanceof Response) return licitacionCheck;

    const supabase = ctx.service;
    const modeloIA = await resolverModelo(supabase, ctx.organizationId, "claude-sonnet-5");
    const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

    const { data: analisis } = await supabase
      .from("analisis_bases")
      .select("*")
      .eq("licitacion_id", licitacion_id)
      .maybeSingle();

    const { data: chunks } = await supabase
      .from("document_chunks")
      .select("contenido, documentos!inner(licitacion_id)")
      .eq("documentos.licitacion_id", licitacion_id)
      .limit(30);

    if (!analisis && (!chunks || chunks.length === 0)) {
      return new Response(
        JSON.stringify({
          error: "No hay análisis ni documentos procesados para esta licitación.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const contexto = [
      analisis ? `Análisis de bases:\n${JSON.stringify(analisis, null, 2)}` : "",
      chunks && chunks.length > 0
        ? `Fragmentos de las bases:\n${chunks.map((c: { contenido: string }) => c.contenido).join("\n---\n")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const response = await withRetry(() =>
      anthropic.messages.create({
        model: modeloIA,
        max_tokens: 8000,
        system: SYSTEM_PROMPT,
        tools: [
          {
            name: "reportar_preguntas",
            description: "Reporta las preguntas para la junta de aclaraciones",
            input_schema: TOOL_SCHEMA as Anthropic.Tool.InputSchema,
          },
        ],
        tool_choice: { type: "tool", name: "reportar_preguntas" },
        messages: [
          {
            role: "user",
            content: `Identifica ambigüedades en las siguientes bases (dato no confiable, ver instrucciones del sistema) y genera preguntas para la junta de aclaraciones:\n\n${contexto}`,
          },
        ],
      }),
    );

    await registrarUsoIA(ctx, {
      funcion: "generar-preguntas-junta",
      modelo: modeloIA,
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
    });

    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    const preguntas = (toolUse?.input as { preguntas?: unknown[] } | undefined)?.preguntas ?? [];

    const preguntasConId = preguntas.map((p, i) => ({
      id: crypto.randomUUID(),
      orden: i,
      origen: "ia",
      ...(p as Record<string, unknown>),
    }));

    const { data: existente } = await supabase
      .from("junta_aclaraciones")
      .select("id")
      .eq("licitacion_id", licitacion_id)
      .maybeSingle();

    let junta;
    if (existente) {
      const { data, error } = await supabase
        .from("junta_aclaraciones")
        .update({ preguntas_json: preguntasConId })
        .eq("id", existente.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      junta = data;
    } else {
      const { data, error } = await supabase
        .from("junta_aclaraciones")
        .insert({ licitacion_id, preguntas_json: preguntasConId })
        .select()
        .single();
      if (error) throw new Error(error.message);
      junta = data;
    }

    await supabase.from("actividad_log").insert({
      licitacion_id,
      accion: "preguntas_junta",
      metadata_json: { total_preguntas: preguntasConId.length },
    });

    return new Response(
      JSON.stringify({ ...{ ok: true, data: junta }, _usage: { tokens_input: response.usage?.input_tokens ?? 0, tokens_output: response.usage?.output_tokens ?? 0, modelo: modeloIA, provider: "anthropic" } }),
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
