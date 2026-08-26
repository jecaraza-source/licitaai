import { z } from "zod";
import { apiRoute, ApiError, requireWriteRole } from "@/lib/api";

const paramsSchema = z.object({ id: z.string().uuid("id debe ser un UUID válido") });
const bodySchema = z.object({
  documento_id: z.string().uuid("documento_id debe ser un UUID válido"),
});

export const POST = apiRoute(
  { paramsSchema, bodySchema, rateLimit: { ruta: "procesar-documento", max: 20 } },
  async ({ ctx, params, body }) => {
    requireWriteRole(ctx);

    const { data: documento } = await ctx.supabase
      .from("documentos")
      .select("id, licitacion_id")
      .eq("id", body.documento_id)
      .eq("licitacion_id", params.id)
      .maybeSingle();

    if (!documento) throw ApiError.notFound("Documento no encontrado");

    const { data, error } = await ctx.supabase.functions.invoke("procesar-documento", {
      body: { documento_id: body.documento_id },
    });

    if (error) throw ApiError.upstream();

    return { data };
  },
);
