import { apiRoute, ApiError } from "@/lib/api";
import { crearJobConPresupuesto, proyectarJobPublico } from "@/lib/jobs";
import { crearJobSchema, listarJobsQuerySchema, JOB_COLUMNS_PUBLICAS } from "@/lib/validations/jobs";

// P2 · A4 — API genérica de jobs asíncronos.

/** Crea (o recupera por idempotency_key) un job. Detrás del flag `jobs.api`
 * hasta que los handlers de dominio existan (Fase B). */
export const POST = apiRoute(
  {
    bodySchema: crearJobSchema,
    rolesPermitidos: ["ADMIN", "MANAGER", "ANALYST"],
    rateLimit: { ruta: "jobs-crear", max: 30 },
    flags: ["jobs.api"],
  },
  async ({ ctx, body }) => {
    // Operaciones sobre la organización entera (export / borrado) tienen su
    // propia ruta con control de rol ADMIN — no se encolan por aquí.
    if (body.tipo === "exportar-organizacion") {
      throw ApiError.forbidden("Usa el endpoint específico de la organización para esta operación");
    }

    const { job, nuevo } = await crearJobConPresupuesto(ctx, {
      tipo: body.tipo,
      recurso_tipo: body.recurso_tipo,
      recurso_id: body.recurso_id,
      input: body.input,
      idempotency_key: body.idempotency_key,
      prioridad: body.prioridad,
      dedup_hash: body.dedup_hash,
    });
    return { data: job, status: nuevo ? 201 : 200 };
  },
);

/** Lista los jobs de la organización del llamante (RLS), paginado. */
export const GET = apiRoute(
  { querySchema: listarJobsQuerySchema },
  async ({ ctx, query }) => {
    let q = ctx.supabase
      .from("jobs")
      .select(JOB_COLUMNS_PUBLICAS, { count: "exact" })
      .order("created_at", { ascending: false });

    if (query.estado) q = q.eq("estado", query.estado);
    if (query.tipo) q = q.eq("tipo", query.tipo);
    if (query.recurso_tipo) q = q.eq("recurso_tipo", query.recurso_tipo);
    if (query.recurso_id) q = q.eq("recurso_id", query.recurso_id);

    const desde = (query.page - 1) * query.pageSize;
    const { data, error, count } = await q.range(desde, desde + query.pageSize - 1);
    if (error) throw ApiError.internal();

    return {
      data: {
        items: (data ?? []).map((r) => proyectarJobPublico(r as unknown as Record<string, unknown>)),
        page: query.page,
        pageSize: query.pageSize,
        total: count ?? 0,
      },
    };
  },
);
