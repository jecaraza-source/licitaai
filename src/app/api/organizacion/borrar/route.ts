import { z } from "zod";
import { apiRoute, ApiError } from "@/lib/api";
import type { PostgrestError } from "@supabase/supabase-js";

// P2 · H5 — autoservicio de borrado de organización (ADR 0010).
// Solo ADMIN. Requiere escribir el nombre exacto de la organización como
// confirmación. Crea una `deletion_requests` PROGRAMADA con 7 días de
// gracia y encola el export. Detrás del flag `datos.borrado_organizacion`.

function mapear(error: PostgrestError): ApiError {
  const hint = error.hint ?? "";
  if (error.code === "42501") return ApiError.forbidden("Solo un ADMIN puede solicitar el borrado");
  if (hint.includes("confirmacion")) {
    return ApiError.validation("El texto de confirmación no coincide con el nombre de la organización");
  }
  if (hint.includes("ya_existe")) return ApiError.conflict("Ya hay un borrado en curso para esta organización");
  if (error.code === "P0002") return ApiError.notFound("No hay un borrado cancelable");
  return ApiError.internal();
}

/** Estado del borrado de la organización (para el aviso "programado / cancelar"). */
export const GET = apiRoute({ rolesPermitidos: ["ADMIN"] }, async ({ ctx }) => {
  const { data, error } = await ctx.supabase
    .from("deletion_requests")
    .select("id, estado, programada_para, gracia_dias, export_job_id, borrado_job_id, datos_purgados_at, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw ApiError.internal();
  return { data: data ?? null };
});

/** Solicita el borrado. `confirmacion` debe ser el nombre de la organización. */
export const POST = apiRoute(
  {
    bodySchema: z.object({ confirmacion: z.string().min(1) }),
    rolesPermitidos: ["ADMIN"],
    rateLimit: { ruta: "org-borrar", max: 5 },
    flags: ["datos.borrado_organizacion"],
  },
  async ({ ctx, body }) => {
    const { data, error } = await ctx.supabase.rpc("solicitar_borrado_organizacion", {
      p_confirmacion: body.confirmacion,
    });
    if (error) throw mapear(error);
    return {
      data: {
        id: data.id,
        estado: data.estado,
        programada_para: data.programada_para,
        export_job_id: data.export_job_id,
      },
      status: 202,
    };
  },
);
