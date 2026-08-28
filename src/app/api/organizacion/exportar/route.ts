import { apiRoute, ApiError } from "@/lib/api";
import { crearJob, proyectarJobPublico } from "@/lib/jobs";

// P2 · H4 — autoservicio de export de datos de la organización (ADR 0010).
// Solo ADMIN. Encola un job `exportar-organizacion`; el worker reúne el
// bundle, lo sube al bucket privado `exportaciones` y devuelve una URL
// firmada de 72 h en `result_ref`. Detrás del flag `datos.export_organizacion`.

/** Encola un export. Idempotente por ventana de 10 min: dos clics seguidos
 * devuelven el mismo job (200), no dos exports. */
export const POST = apiRoute(
  {
    rolesPermitidos: ["ADMIN"],
    rateLimit: { ruta: "org-exportar", max: 5 },
    flags: ["datos.export_organizacion"],
  },
  async ({ ctx }) => {
    const bucket10min = Math.floor(Date.now() / 600_000);
    const { job, nuevo } = await crearJob(ctx, {
      tipo: "exportar-organizacion",
      recurso_tipo: "organizacion",
      recurso_id: ctx.organizationId,
      idempotency_key: `export:${ctx.organizationId}:${bucket10min}`,
      prioridad: 90,
    });
    return { data: job, status: nuevo ? 202 : 200 };
  },
);

/** Lista los exports pasados de la organización (RLS acota a la propia). */
export const GET = apiRoute({ rolesPermitidos: ["ADMIN"] }, async ({ ctx }) => {
  const { data, error } = await ctx.supabase
    .from("jobs")
    .select("*")
    .eq("tipo", "exportar-organizacion")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw ApiError.internal();
  return { data: (data ?? []).map((r) => proyectarJobPublico(r as unknown as Record<string, unknown>)) };
});
