import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (!(await checkRateLimit(supabase, "referencias-legales-preguntar"))) {
    return rateLimitResponse();
  }

  const { pregunta, referencia_legal_id } = await request.json();
  if (!pregunta || typeof pregunta !== "string") {
    return NextResponse.json({ error: "pregunta requerida" }, { status: 400 });
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const embeddingResponse = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: pregunta,
  });
  const queryEmbedding = embeddingResponse.data[0].embedding;

  const { data: chunks, error: searchError } = await supabase.rpc("search_referencia_chunks", {
    query_embedding: queryEmbedding,
    match_count: 8,
    referencia_legal_id_param: referencia_legal_id ?? null,
  });

  if (searchError) {
    return NextResponse.json({ error: searchError.message }, { status: 500 });
  }

  if (!chunks || chunks.length === 0) {
    return NextResponse.json({
      data: {
        respuesta:
          "Aún no hay contenido cargado en el catálogo de referencias legales para responder esta pregunta.",
        fuentes: [],
      },
    });
  }

  type ChunkRow = {
    contenido: string;
    articulo: string | null;
    referencia_legal_id: string;
    referencia_nombre: string;
    referencia_nombre_completo: string;
  };

  const { data: urls } = await supabase
    .from("referencias_legales")
    .select("id, url_oficial")
    .in("id", [...new Set((chunks as ChunkRow[]).map((c) => c.referencia_legal_id))]);
  const urlPorReferencia = new Map((urls ?? []).map((r) => [r.id, r.url_oficial]));

  const contexto = (chunks as ChunkRow[])
    .map(
      (c, i) =>
        `[Fuente ${i + 1} — ${c.referencia_nombre}${c.articulo ? `, ${c.articulo}` : ""}]\n${c.contenido}`,
    )
    .join("\n\n");

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 2000,
    system:
      "Eres un asistente experto en el marco legal de licitaciones públicas en México. Responde la pregunta del usuario ÚNICAMENTE con base en los fragmentos de leyes/reglamentos proporcionados. Cita la fuente entre corchetes, por ejemplo [Fuente 2], junto con el nombre de la ley y el artículo cuando lo uses. Si la respuesta no está en los fragmentos, dilo explícitamente y no la inventes. No des asesoría legal definitiva: aclara que es información de referencia y que ante dudas conviene confirmar con asesoría legal.",
    messages: [
      {
        role: "user",
        content: `Fragmentos de leyes y reglamentos:\n\n${contexto}\n\nPregunta: ${pregunta}`,
      },
    ],
  });

  const textBlock = response.content.find(
    (b): b is Anthropic.TextBlock => b.type === "text",
  );

  return NextResponse.json({
    data: {
      respuesta: textBlock?.text ?? "",
      fuentes: (chunks as ChunkRow[]).map((c, i) => ({
        indice: i + 1,
        ley: c.referencia_nombre,
        ley_completa: c.referencia_nombre_completo,
        articulo: c.articulo,
        extracto: c.contenido.slice(0, 300),
        url_oficial: urlPorReferencia.get(c.referencia_legal_id) ?? null,
      })),
    },
  });
}
