import { apiRoute, ApiError } from "@/lib/api";
import { mapearErrorRpcJob, proyectarJobPublico } from "@/lib/jobs";
import { jobIdParamsSchema } from "@/lib/validations/jobs";

// P2 · A4 — cancela un job. Si está PENDING/AUTHORIZED/RETRYING pasa a
// CANCELLED de inmediato; si está RUNNING marca cancel_solicitada y el
// worker lo cierra en su siguiente checkpoint (cancelación cooperativa).
// Un job en estado terminal se devuelve sin cambios.
export const POST = apiRoute(
  {
    paramsSchema: jobIdParamsSchema,
    rolesPermitidos: ["ADMIN", "MANAGER", "ANALYST"],
    rateLimit: { ruta: "jobs-cancelar", max: 30 },
  },
  async ({ ctx, params }) => {
    const { data, error } = await ctx.supabase.rpc("cancelar_job", { p_job_id: params.id });
    if (error) throw mapearErrorRpcJob(error);
    if (!data) throw ApiError.notFound("Job no encontrado");
    return { data: proyectarJobPublico(data as Record<string, unknown>) };
  },
);
