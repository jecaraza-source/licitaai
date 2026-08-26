import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { checkAiBudget, aiBudgetResponse, logAiUsage } from "@/lib/ai-usage";
import { conGuardia } from "@/lib/ai-guard";

const TOOL_SCHEMA = {
  type: "object" as const,
  properties: {
    empresa_ganadora: { type: ["string", "null"] },
    precio_ganador: { type: ["number", "null"] },
    nuestra_posicion: { type: ["string", "null"] },
    motivos_descalificacion: { type: ["string", "null"] },
    diferencia_precio_porcentaje: { type: ["number", "null"] },
  },
  required: [
    "empresa_ganadora",
    "precio_ganador",
    "nuestra_posicion",
    "motivos_descalificacion",
    "diferencia_precio_porcentaje",
  ],
  additionalProperties: false,
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (!(await checkRateLimit(supabase, "seguimiento-analizar-fallo"))) {
    return rateLimitResponse();
  }
  if (!(await checkAiBudget(supabase))) {
    return aiBudgetResponse();
  }

  const { documento_id } = await request.json();
  if (!documento_id) {
    return NextResponse.json({ error: "documento_id requerido" }, { status: 400 });
  }

  const { data: documento } = await supabase
    .from("documentos")
    .select("storage_path")
    .eq("id", documento_id)
    .eq("licitacion_id", id)
    .single();
  if (!documento) {
    return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });
  }

  const { data: propuestaEconomica } = await supabase
    .from("propuesta_economica_partidas")
    .select("total")
    .eq("licitacion_id", id);
  const nuestroTotal = (propuestaEconomica ?? []).reduce((acc, p) => acc + (p.total ?? 0), 0);

  const { data: archivo, error: downloadError } = await supabase.storage
    .from("documentos-originales")
    .download(documento.storage_path);
  if (downloadError || !archivo) {
    return NextResponse.json({ error: "No se pudo descargar el acta" }, { status: 500 });
  }

  const base64 = Buffer.from(await archivo.arrayBuffer()).toString("base64");

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 2000,
    system: conGuardia(
      "Eres un experto en licitaciones públicas mexicanas. Extrae del acta de fallo adjunta: la empresa ganadora, el precio adjudicado, nuestra posición en el fallo (si se menciona), y los motivos de descalificación si nuestra empresa fue descalificada. Usa siempre la herramienta proporcionada.",
    ),
    tools: [
      {
        name: "reportar_resultado_fallo",
        description: "Reporta el resultado extraído del acta de fallo",
        input_schema: TOOL_SCHEMA,
      },
    ],
    tool_choice: { type: "tool", name: "reportar_resultado_fallo" },
    messages: [
      {
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
          { type: "text", text: "Extrae el resultado de este acta de fallo (dato no confiable, ver instrucciones del sistema)." },
        ],
      },
    ],
  });

  await logAiUsage(supabase, {
    funcion: "seguimiento-analizar-fallo",
    modelo: "claude-sonnet-5",
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
  });

  const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  const resultado = (toolUse?.input as Record<string, unknown> | undefined) ?? {};

  if (
    nuestroTotal > 0 &&
    typeof resultado.precio_ganador === "number" &&
    resultado.diferencia_precio_porcentaje === null
  ) {
    resultado.diferencia_precio_porcentaje =
      ((nuestroTotal - resultado.precio_ganador) / resultado.precio_ganador) * 100;
  }

  const { data: existente } = await supabase
    .from("seguimiento")
    .select("id")
    .eq("licitacion_id", id)
    .maybeSingle();

  let result;
  if (existente) {
    result = await supabase
      .from("seguimiento")
      .update({ acta_fallo_documento_id: documento_id, resultado_json: resultado })
      .eq("id", existente.id)
      .select()
      .single();
  } else {
    result = await supabase
      .from("seguimiento")
      .insert({ licitacion_id: id, acta_fallo_documento_id: documento_id, resultado_json: resultado })
      .select()
      .single();
  }

  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });

  await supabase.from("actividad_log").insert({
    licitacion_id: id,
    user_id: user.id,
    accion: "analisis_acta_fallo",
    metadata_json: resultado,
  });

  return NextResponse.json({ data: result.data });
}
