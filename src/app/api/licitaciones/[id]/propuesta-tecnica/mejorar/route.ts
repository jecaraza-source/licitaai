import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { checkAiBudget, aiBudgetResponse, logAiUsage } from "@/lib/ai-usage";
import { conGuardia } from "@/lib/ai-guard";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (!(await checkRateLimit(supabase, "propuesta-tecnica-mejorar"))) {
    return rateLimitResponse();
  }
  if (!(await checkAiBudget(supabase))) {
    return aiBudgetResponse();
  }

  const { html } = await request.json();
  if (!html || typeof html !== "string") {
    return NextResponse.json({ error: "html requerido" }, { status: 400 });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await anthropic.messages.stream({
    model: "claude-sonnet-5",
    max_tokens: 4000,
    system: conGuardia(
      "Eres un editor experto en propuestas técnicas para licitaciones públicas mexicanas. Mejora la redacción, claridad y persuasión del siguiente contenido sin inventar datos nuevos ni cambiar cifras o nombres propios. Responde ÚNICAMENTE con el HTML mejorado usando las mismas etiquetas simples (h2, h3, p, ul, li, strong, em, table), sin explicaciones adicionales.",
    ),
    messages: [{ role: "user", content: html }],
  }).finalMessage();

  await logAiUsage(supabase, {
    funcion: "propuesta-tecnica-mejorar",
    modelo: "claude-sonnet-5",
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
  });

  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");

  return NextResponse.json({ data: { html: textBlock?.text ?? html } });
}
