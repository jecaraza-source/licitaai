import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { apiRoute } from "@/lib/api";
import { logAiUsage } from "@/lib/ai-usage";
import { conGuardia } from "@/lib/ai-guard";

const bodySchema = z.object({ html: z.string().min(1, "html requerido") });

export const POST = apiRoute(
  {
    bodySchema,
    rateLimit: { ruta: "propuesta-tecnica-mejorar" },
    aiBudget: true,
  },
  async ({ ctx, body }) => {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await anthropic.messages
      .stream({
        model: "claude-sonnet-5",
        max_tokens: 4000,
        system: conGuardia(
          "Eres un editor experto en propuestas técnicas para licitaciones públicas mexicanas. Mejora la redacción, claridad y persuasión del siguiente contenido sin inventar datos nuevos ni cambiar cifras o nombres propios. Responde ÚNICAMENTE con el HTML mejorado usando las mismas etiquetas simples (h2, h3, p, ul, li, strong, em, table), sin explicaciones adicionales.",
        ),
        messages: [{ role: "user", content: body.html }],
      })
      .finalMessage();

    await logAiUsage(ctx.supabase, {
      funcion: "propuesta-tecnica-mejorar",
      modelo: "claude-sonnet-5",
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
    });

    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");

    return { data: { html: textBlock?.text ?? body.html } };
  },
);
