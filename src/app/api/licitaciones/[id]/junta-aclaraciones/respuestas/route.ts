import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

interface Pregunta {
  id: string;
  texto: string;
}

const TOOL_SCHEMA = {
  type: "object" as const,
  properties: {
    respuestas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          pregunta_id: { type: ["string", "null"] },
          pregunta_texto: { type: "string" },
          respuesta: { type: "string" },
        },
        required: ["pregunta_id", "pregunta_texto", "respuesta"],
        additionalProperties: false,
      },
    },
  },
  required: ["respuestas"],
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
  if (!(await checkRateLimit(supabase, "junta-respuestas"))) {
    return rateLimitResponse();
  }

  const { documento_id } = await request.json();
  if (!documento_id) {
    return NextResponse.json({ error: "documento_id requerido" }, { status: 400 });
  }

  const { data: documento } = await supabase
    .from("documentos")
    .select("storage_path, nombre")
    .eq("id", documento_id)
    .eq("licitacion_id", id)
    .single();
  if (!documento) {
    return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });
  }

  const { data: junta } = await supabase
    .from("junta_aclaraciones")
    .select("id, preguntas_json")
    .eq("licitacion_id", id)
    .maybeSingle();
  if (!junta) {
    return NextResponse.json(
      { error: "Primero genera o captura las preguntas de la junta." },
      { status: 400 },
    );
  }

  const { data: archivo, error: downloadError } = await supabase.storage
    .from("documentos-originales")
    .download(documento.storage_path);
  if (downloadError || !archivo) {
    return NextResponse.json({ error: "No se pudo descargar el acta" }, { status: 500 });
  }

  const base64 = Buffer.from(await archivo.arrayBuffer()).toString("base64");
  const preguntas = (junta.preguntas_json ?? []) as Pregunta[];

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 8000,
    system:
      "Eres un experto en licitaciones públicas mexicanas. Extrae las respuestas del acta de junta de aclaraciones y vincúlalas con la pregunta correspondiente de la lista proporcionada, usando su pregunta_id cuando coincida. Si una respuesta no corresponde a ninguna pregunta de la lista, deja pregunta_id en null. Usa siempre la herramienta proporcionada.",
    tools: [
      {
        name: "reportar_respuestas",
        description: "Reporta las respuestas extraídas del acta",
        input_schema: TOOL_SCHEMA,
      },
    ],
    tool_choice: { type: "tool", name: "reportar_respuestas" },
    messages: [
      {
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
          {
            type: "text",
            text: `Preguntas originales:\n${JSON.stringify(preguntas.map((p) => ({ id: p.id, texto: p.texto })))}\n\nExtrae las respuestas del acta adjunta.`,
          },
        ],
      },
    ],
  });

  const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  const respuestas = (toolUse?.input as { respuestas?: unknown[] } | undefined)?.respuestas ?? [];

  const { data, error } = await supabase
    .from("junta_aclaraciones")
    .update({ respuestas_json: respuestas, estado: "RESPONDIDA" })
    .eq("id", junta.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase.from("actividad_log").insert({
    licitacion_id: id,
    user_id: user.id,
    accion: "respuestas_junta",
    metadata_json: { documento_id, total_respuestas: respuestas.length },
  });

  return NextResponse.json({ data });
}
