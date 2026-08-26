import { z } from "zod";
import { apiRoute, ApiError, requireWriteRole } from "@/lib/api";

const paramsSchema = z.object({ id: z.string().uuid("id debe ser un UUID válido") });
const postBodySchema = z.object({
  requisito: z.string().trim().min(1, "requisito requerido").max(2000),
  obligatorio: z.boolean().optional().default(true),
});

export const GET = apiRoute({ paramsSchema }, async ({ ctx, params }) => {
  const { data, error } = await ctx.supabase
    .from("requisitos_tecnicos")
    .select("*, documentos(id, nombre)")
    .eq("licitacion_id", params.id)
    .order("orden");

  if (error) throw ApiError.internal();
  return { data };
});

export const POST = apiRoute({ paramsSchema, bodySchema: postBodySchema }, async ({ ctx, params, body }) => {
  requireWriteRole(ctx);

  const { count } = await ctx.supabase
    .from("requisitos_tecnicos")
    .select("id", { count: "exact", head: true })
    .eq("licitacion_id", params.id);

  const { data, error } = await ctx.supabase
    .from("requisitos_tecnicos")
    .insert({
      licitacion_id: params.id,
      orden: count ?? 0,
      requisito: body.requisito,
      obligatorio: body.obligatorio,
    })
    .select()
    .single();

  if (error) throw ApiError.internal();
  return { data, status: 201 };
});
