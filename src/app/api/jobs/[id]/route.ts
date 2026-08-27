import { apiRoute, ApiError } from "@/lib/api";
import { proyectarJobPublico } from "@/lib/jobs";
import { jobIdParamsSchema, JOB_COLUMNS_PUBLICAS } from "@/lib/validations/jobs";

// P2 · A4 — estado de un job. Cualquier rol autenticado de la organización
// puede consultarlo (RLS filtra por organización). Es el endpoint que
// consulta <JobStatus> como fallback cuando Realtime no está disponible.
export const GET = apiRoute(
  { paramsSchema: jobIdParamsSchema },
  async ({ ctx, params }) => {
    const { data, error } = await ctx.supabase
      .from("jobs")
      .select(JOB_COLUMNS_PUBLICAS)
      .eq("id", params.id)
      .maybeSingle();

    if (error) throw ApiError.internal();
    if (!data) throw ApiError.notFound("Job no encontrado");

    return { data: proyectarJobPublico(data as unknown as Record<string, unknown>) };
  },
);
