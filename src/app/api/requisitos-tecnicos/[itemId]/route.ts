import { z } from "zod";
import { apiRoute, ApiError, requireWriteRole } from "@/lib/api";

const paramsSchema = z.object({ itemId: z.string().uuid("itemId debe ser un UUID válido") });

const patchSchema = z
  .object({
    requisito: z.string().trim().min(1).max(2000).optional(),
    obligatorio: z.boolean().optional(),
    cumple: z.boolean().nullable().optional(),
    como_cumple: z.string().trim().max(5000).nullable().optional(),
    evidencia: z.string().trim().max(5000).nullable().optional(),
    documento_id: z.string().uuid().nullable().optional(),
  })
  .strict();

export const PATCH = apiRoute(
  { paramsSchema, bodySchema: patchSchema },
  async ({ ctx, params, body }) => {
    requireWriteRole(ctx);

    if (Object.keys(body).length === 0) {
      throw ApiError.validation("No se enviaron campos para actualizar");
    }

    const { data, error } = await ctx.supabase
      .from("requisitos_tecnicos")
      .update(body)
      .eq("id", params.itemId)
      .select()
      .maybeSingle();

    if (error) throw ApiError.internal();
    if (!data) throw ApiError.notFound("Requisito técnico no encontrado");
    return { data };
  },
);

export const DELETE = apiRoute({ paramsSchema }, async ({ ctx, params }) => {
  requireWriteRole(ctx);

  const { data, error } = await ctx.supabase
    .from("requisitos_tecnicos")
    .delete()
    .eq("id", params.itemId)
    .select("id")
    .maybeSingle();

  if (error) throw ApiError.internal();
  if (!data) throw ApiError.notFound("Requisito técnico no encontrado");
  return { data: { ok: true } };
});
