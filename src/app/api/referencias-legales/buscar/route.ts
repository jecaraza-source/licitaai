import { z } from "zod";
import { apiRoute, ApiError } from "@/lib/api";

const querySchema = z.object({
  q: z.string().trim().min(1, "q requerido").max(500),
  referencia_id: z.string().uuid().optional(),
});

export const GET = apiRoute({ querySchema }, async ({ ctx, query }) => {
  const { data, error } = await ctx.supabase.rpc("buscar_referencias_texto", {
    query_text: query.q,
    referencia_legal_id_param: query.referencia_id ?? null,
    match_count: 20,
  });

  if (error) throw ApiError.internal();
  return { data: data ?? [] };
});
