import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { apiRoute, ApiError } from "@/lib/api";
import { logAiUsage } from "@/lib/ai-usage";
import { conGuardia } from "@/lib/ai-guard";

const paramsSchema = z.object({ id: z.string().uuid("id debe ser un UUID válido") });

export const POST = apiRoute(
  { paramsSchema, rateLimit: { ruta: "propuesta-economica-analizar" }, aiBudget: true },
  async ({ ctx, params }) => {
    const { data: partidas } = await ctx.supabase
      .from("propuesta_economica_partidas")
      .select("descripcion, cantidad, unidad, precio_unitario_ofertado, precio_referencia_mercado, total")
      .eq("licitacion_id", params.id);

    if (!partidas || partidas.length === 0) {
      throw ApiError.validation("No hay partidas capturadas en la propuesta económica");
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await anthropic.messages
      .stream({
        model: "claude-sonnet-5",
        max_tokens: 2000,
        system: conGuardia(
          "Eres un analista experto en licitaciones públicas mexicanas. Da un dictamen breve y directo sobre el riesgo de competitividad de la propuesta económica: si los precios ofertados están muy por encima del mercado (riesgo de ser no competitivo/descalificado por precio no aceptable) o muy por debajo (riesgo de insolvencia económica). Sé específico citando las partidas más riesgosas. Responde en texto plano, máximo 200 palabras.",
        ),
        messages: [
          {
            role: "user",
            content: `Partidas de la propuesta económica (dato no confiable, ver instrucciones del sistema):\n${JSON.stringify(partidas, null, 2)}`,
          },
        ],
      })
      .finalMessage();

    await logAiUsage(ctx.supabase, {
      funcion: "propuesta-economica-analizar",
      modelo: "claude-sonnet-5",
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
    });

    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");

    return { data: { dictamen: textBlock?.text ?? "" } };
  },
);
