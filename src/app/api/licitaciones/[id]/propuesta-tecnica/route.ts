import { z } from "zod";
import { apiRoute, ApiError, requireWriteRole } from "@/lib/api";

const paramsSchema = z.object({ id: z.string().uuid("id debe ser un UUID válido") });
const putBodySchema = z.object({
  contenido_json: z.record(z.string(), z.unknown()),
});

export const GET = apiRoute({ paramsSchema }, async ({ ctx, params }) => {
  const { data, error } = await ctx.supabase
    .from("propuestas")
    .select("*")
    .eq("licitacion_id", params.id)
    .eq("tipo", "TECNICA")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw ApiError.internal();
  return { data };
});

export const PUT = apiRoute({ paramsSchema, bodySchema: putBodySchema }, async ({ ctx, params, body }) => {
  requireWriteRole(ctx);

  const { data: actual } = await ctx.supabase
    .from("propuestas")
    .select("id")
    .eq("licitacion_id", params.id)
    .eq("tipo", "TECNICA")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!actual) throw ApiError.notFound("No hay propuesta técnica generada");

  const { data, error } = await ctx.supabase
    .from("propuestas")
    .update({ contenido_json: body.contenido_json })
    .eq("id", actual.id)
    .select()
    .single();

  if (error) throw ApiError.internal();
  return { data };
});
