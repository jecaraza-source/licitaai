import { z } from "zod";
import { apiRoute, ApiError, requireWriteRole } from "@/lib/api";

const paramsSchema = z.object({ id: z.string().uuid("id debe ser un UUID válido") });
const putBodySchema = z.object({
  preguntas_json: z.array(z.unknown()).optional(),
  estado: z.string().trim().min(1).optional(),
});

export const GET = apiRoute({ paramsSchema }, async ({ ctx, params }) => {
  const { data, error } = await ctx.supabase
    .from("junta_aclaraciones")
    .select("*")
    .eq("licitacion_id", params.id)
    .maybeSingle();

  if (error) throw ApiError.internal();
  return { data };
});

export const PUT = apiRoute({ paramsSchema, bodySchema: putBodySchema }, async ({ ctx, params, body }) => {
  requireWriteRole(ctx);

  const update: Record<string, unknown> = {};
  if (body.preguntas_json !== undefined) update.preguntas_json = body.preguntas_json;
  if (body.estado !== undefined) update.estado = body.estado;

  const { data: existente } = await ctx.supabase
    .from("junta_aclaraciones")
    .select("id")
    .eq("licitacion_id", params.id)
    .maybeSingle();

  let result;
  if (existente) {
    result = await ctx.supabase
      .from("junta_aclaraciones")
      .update(update)
      .eq("id", existente.id)
      .select()
      .single();
  } else {
    result = await ctx.supabase
      .from("junta_aclaraciones")
      .insert({ licitacion_id: params.id, ...update })
      .select()
      .single();
  }

  if (result.error) throw ApiError.internal();
  return { data: result.data };
});
