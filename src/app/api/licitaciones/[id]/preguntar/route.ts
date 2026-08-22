import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";

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

  const { pregunta } = await request.json();
  if (!pregunta || typeof pregunta !== "string") {
    return NextResponse.json({ error: "pregunta requerida" }, { status: 400 });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const embeddingResponse = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: pregunta,
  });
  const queryEmbedding = embeddingResponse.data[0].embedding;

  const { data: chunks, error: searchError } = await supabase.rpc("search_chunks", {
    query_embedding: queryEmbedding,
    licitacion_id_param: id,
    match_count: 6,
  });

  if (searchError) {
    return NextResponse.json({ error: searchError.message }, { status: 500 });
  }

  if (!chunks || chunks.length === 0) {
    return NextResponse.json({
      data: {
        respuesta:
          "Aún no hay documentos procesados para esta licitación, así que no puedo responder con base en ellos.",
        referencias: [],
      },
    });
  }

  const contexto = chunks
    .map((c: { contenido: string }, i: number) => `[Fragmento ${i + 1}]\n${c.contenido}`)
    .join("\n\n");

  const response = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 2000,
    system:
      "Eres un asistente experto en licitaciones públicas mexicanas. Responde la pregunta del usuario ÚNICAMENTE con base en los fragmentos de las bases de licitación proporcionados. Si la respuesta no está en los fragmentos, dilo explícitamente. Cita el número de fragmento entre corchetes, por ejemplo [Fragmento 2], cuando uses información de él.",
    messages: [
      {
        role: "user",
        content: `Fragmentos de las bases de licitación:\n\n${contexto}\n\nPregunta: ${pregunta}`,
      },
    ],
  });

  const textBlock = response.content.find(
    (b): b is Anthropic.TextBlock => b.type === "text",
  );

  return NextResponse.json({
    data: {
      respuesta: textBlock?.text ?? "",
      referencias: chunks.map((c: { contenido: string }, i: number) => ({
        indice: i + 1,
        extracto: c.contenido.slice(0, 200),
      })),
    },
  });
}
