import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function POST(
  _request: NextRequest,
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
  if (!(await checkRateLimit(supabase, "propuesta-economica-analizar"))) {
    return rateLimitResponse();
  }

  const { data: partidas } = await supabase
    .from("propuesta_economica_partidas")
    .select("descripcion, cantidad, unidad, precio_unitario_ofertado, precio_referencia_mercado, total")
    .eq("licitacion_id", id);

  if (!partidas || partidas.length === 0) {
    return NextResponse.json({ error: "No hay partidas capturadas en la propuesta económica" }, { status: 400 });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await anthropic.messages.stream({
    model: "claude-sonnet-5",
    max_tokens: 2000,
    system:
      "Eres un analista experto en licitaciones públicas mexicanas. Da un dictamen breve y directo sobre el riesgo de competitividad de la propuesta económica: si los precios ofertados están muy por encima del mercado (riesgo de ser no competitivo/descalificado por precio no aceptable) o muy por debajo (riesgo de insolvencia económica). Sé específico citando las partidas más riesgosas. Responde en texto plano, máximo 200 palabras.",
    messages: [
      {
        role: "user",
        content: `Partidas de la propuesta económica:\n${JSON.stringify(partidas, null, 2)}`,
      },
    ],
  }).finalMessage();

  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");

  return NextResponse.json({ data: { dictamen: textBlock?.text ?? "" } });
}
