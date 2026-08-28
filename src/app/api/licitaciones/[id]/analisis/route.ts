import { z } from "zod";
import { apiRoute, ApiError } from "@/lib/api";

const paramsSchema = z.object({ id: z.string().uuid("id debe ser un UUID válido") });
const querySchema = z.object({ documento_id: z.string().uuid().optional() });

export const GET = apiRoute({ paramsSchema, querySchema }, async ({ ctx, params, query }) => {
  let dbQuery = ctx.supabase.from("analisis_bases").select("*").eq("licitacion_id", params.id);
  dbQuery = query.documento_id
    ? dbQuery.eq("documento_id", query.documento_id)
    : dbQuery.is("documento_id", null);

  const { data, error } = await dbQuery.maybeSingle();
  if (error) throw ApiError.internal();

  return { data };
});
