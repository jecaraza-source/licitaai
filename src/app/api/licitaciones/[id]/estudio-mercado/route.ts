import { z } from "zod";
import { apiRoute, ApiError, requireWriteRole } from "@/lib/api";
import { encolarOperacionIA } from "@/lib/jobs";

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

    requireWriteRole(ctx);
    const encolado = await encolarOperacionIA(ctx, {
      flag: "jobs.async_estudio_mercado",
      tipo: "generar-estudio-mercado",
      recursoTipo: "licitacion",
      recursoId: params.id,
      input: { licitacion_id: params.id, partida_id: body.partida_id },
    });
    if (encolado) return { data: encolado, status: 202 };

    const { data, error } = await ctx.supabase.functions.invoke("generar-estudio-mercado", {
      body: { licitacion_id: params.id, partida_id: body.partida_id },
    });

    if (error) throw ApiError.upstream();

    return { data };
  },
);
