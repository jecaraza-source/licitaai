import { z } from "zod";
import { apiRoute, ApiError, requireWriteRole } from "@/lib/api";

const paramsSchema = z.object({ id: z.string().uuid("id debe ser un UUID válido") });

export const POST = apiRoute(
  { paramsSchema, rateLimit: { ruta: "junta-generar" } },
  async ({ ctx, params }) => {
    requireWriteRole(ctx);

    const { data, error } = await ctx.supabase.functions.invoke("generar-preguntas-junta", {
      body: { licitacion_id: params.id },
    });

    if (error) throw ApiError.upstream();

    return { data: data?.data ?? null };
  },
);
