import { z } from "zod";
import { apiRoute, ApiError } from "@/lib/api";

const paramsSchema = z.object({ id: z.string().uuid("id debe ser un UUID válido") });

export const GET = apiRoute({ paramsSchema }, async ({ ctx, params }) => {
  const [{ data: partidas, error: partidasError }, { data: estudios, error: estudiosError }] =
    await Promise.all([
      ctx.supabase.from("partidas").select("*").eq("licitacion_id", params.id).order("numero"),
      ctx.supabase.from("estudio_mercado").select("*").eq("licitacion_id", params.id),
    ]);

  if (partidasError || estudiosError) throw ApiError.internal();

  const estudiosPorPartida = new Map((estudios ?? []).map((e) => [e.partida_id, e]));
  const data = (partidas ?? []).map((p) => ({
    ...p,
    estudio_mercado: estudiosPorPartida.get(p.id) ?? null,
  }));

  return { data };
});
