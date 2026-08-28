import { z } from "zod";
import { apiRoute, ApiError, requireWriteRole } from "@/lib/api";

const paramsSchema = z.object({ id: z.string().uuid("id debe ser un UUID válido") });
const bodySchema = z.object({ tipo: z.string().trim().min(1), no_aplica: z.boolean() });

export const PATCH = apiRoute({ paramsSchema, bodySchema }, async ({ ctx, params, body }) => {
  requireWriteRole(ctx);

  const { data: actual, error: actualError } = await ctx.supabase
    .from("licitaciones")
    .select("documentos_convocante_no_aplica")
    .eq("id", params.id)
    .maybeSingle();

  if (actualError) throw ApiError.internal();
  if (!actual) throw ApiError.notFound("Licitación no encontrada");

  const actuales = (actual.documentos_convocante_no_aplica as string[] | null) ?? [];
  const siguientes = body.no_aplica
    ? [...new Set([...actuales, body.tipo])]
    : actuales.filter((t) => t !== body.tipo);

  const { data, error } = await ctx.supabase
    .from("licitaciones")
    .update({ documentos_convocante_no_aplica: siguientes })
    .eq("id", params.id)
    .select("documentos_convocante_no_aplica")
    .single();

  if (error) throw ApiError.internal();
  return { data };
});
