import { z } from "zod";
import { apiRoute, ApiError, requireWriteRole } from "@/lib/api";
import type { EjeViabilidad, RespuestaViabilidad } from "@/types";

const EJES: EjeViabilidad[] = [
  "JURIDICO",
  "TECNICO",
  "EXPERIENCIA",
  "PERSONAL",
  "CERTIFICACIONES",
  "COMERCIAL",
  "LOGISTICO",
  "FINANCIERO",
  "ECONOMICO",
];

function buildRespuestas(existentes: RespuestaViabilidad[] = []): RespuestaViabilidad[] {
  const previas = new Map(existentes.map((r) => [r.eje, r]));
  return EJES.map((eje) => previas.get(eje) ?? { eje, respuesta: null, comentario: "" });
}

const paramsSchema = z.object({ id: z.string().uuid("id debe ser un UUID válido") });
// Igual que responsabilidades/route.ts: antes respuestas_json se pasaba sin
// verificar que fuera un array, arriesgando un TypeError no controlado
// dentro de buildRespuestas.
const putBodySchema = z.object({
  respuestas_json: z
    .array(
      z.object({
        eje: z.enum(EJES as [EjeViabilidad, ...EjeViabilidad[]]),
        respuesta: z.enum(["SI", "PARCIAL", "NO"]).nullable(),
        comentario: z.string(),
      }),
    )
    .optional()
    .default([]),
  decision: z.enum(["GO", "NO_GO"]).nullable().optional(),
});

export const GET = apiRoute({ paramsSchema }, async ({ ctx, params }) => {
  const { data: existente, error } = await ctx.supabase
    .from("viabilidad")
    .select("*")
    .eq("licitacion_id", params.id)
    .maybeSingle();

  if (error) throw ApiError.internal();

  return {
    data: {
      respuestas_json: buildRespuestas(existente?.respuestas_json ?? []),
      decision: existente?.decision ?? null,
      decidido_at: existente?.decidido_at ?? null,
    },
  };
});

export const PUT = apiRoute({ paramsSchema, bodySchema: putBodySchema }, async ({ ctx, params, body }) => {
  requireWriteRole(ctx);

  const respuestas = buildRespuestas(body.respuestas_json);
  const decision = body.decision ?? null;

  const update: Record<string, unknown> = {
    licitacion_id: params.id,
    respuestas_json: respuestas,
    decision,
  };
  if (decision) {
    update.decidido_por = ctx.userId;
    update.decidido_at = new Date().toISOString();
  }

  const { data, error } = await ctx.supabase
    .from("viabilidad")
    .upsert(update, { onConflict: "licitacion_id" })
    .select()
    .single();

  if (error) throw ApiError.internal();
  return { data };
});
