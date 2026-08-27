import { z } from "zod";
import { apiRoute, ApiError } from "@/lib/api";

// P2 · I6 — historial de actividad de la organización (cross-licitación),
// paginado. `actividad_log` ya está scoped por RLS a la organización vía la
// licitación; aquí se agrega también la bitácora de auditoría inmutable.
const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
});

export const GET = apiRoute({ querySchema }, async ({ ctx, query }) => {
  const desde = (query.page - 1) * query.pageSize;

  const [{ data: actividad, error: e1 }, { data: auditoria, error: e2 }] = await Promise.all([
    ctx.supabase
      .from("actividad_log")
      .select("id, licitacion_id, user_id, accion, metadata_json, created_at")
      .order("created_at", { ascending: false })
      .range(desde, desde + query.pageSize - 1),
    ctx.supabase
      .from("audit_log")
      .select("id, actor_id, accion, recurso_tipo, recurso_id, detalle_json, created_at")
      .order("created_at", { ascending: false })
      .range(0, query.pageSize - 1),
  ]);

  if (e1 || e2) throw ApiError.internal();

  return {
    data: {
      actividad: actividad ?? [],
      auditoria: auditoria ?? [],
      page: query.page,
      pageSize: query.pageSize,
    },
  };
});
