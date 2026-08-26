import { z } from "zod";
import { apiRoute, ApiError } from "@/lib/api";

const paramsSchema = z.object({ id: z.string().uuid("id debe ser un UUID válido") });
const bodySchema = z.object({ partida_id: z.string().uuid().optional() });

export const POST = apiRoute(
  { paramsSchema, bodySchema, rateLimit: { ruta: "estudio-mercado" } },
  async ({ ctx, params, body }) => {
    const { data: licitacion, error: licitacionError } = await ctx.supabase
      .from("licitaciones")
      .select("id")
      .eq("id", params.id)
      .maybeSingle();

    if (licitacionError) throw ApiError.internal();
    if (!licitacion) throw ApiError.notFound("Licitación no encontrada");

    const { data, error } = await ctx.supabase.functions.invoke("generar-estudio-mercado", {
      body: { licitacion_id: params.id, partida_id: body.partida_id },
    });

    if (error) throw ApiError.upstream();

    return { data };
  },
);
