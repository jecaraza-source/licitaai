import { apiRoute, ApiError } from "@/lib/api";
import {
  aiResultIdParamsSchema,
  revisionAiResultSchema,
  AI_RESULT_COLUMNS,
} from "@/lib/validations/ai-results";

// P2 · D5/D6 — revisión humana de un resultado de IA (ADR 0006).
// APROBADO habilita las acciones críticas que dependen de ese resultado;
// RECHAZADO es también el flujo "reportar resultado incorrecto" (D6).
// Nunca modifica resultado_json — solo el estado de aprobación.
export const POST = apiRoute(
  {
    paramsSchema: aiResultIdParamsSchema,
    bodySchema: revisionAiResultSchema,
    rolesPermitidos: ["ADMIN", "MANAGER", "ANALYST"],
    rateLimit: { ruta: "ai-result-revision", max: 60 },
  },
  async ({ ctx, params, body }) => {
    const { data, error } = await ctx.supabase.rpc("aprobar_resultado_ia", {
      p_result_id: params.id,
      p_estado: body.estado,
    });

    if (error) {
      if (error.code === "P0002") throw ApiError.notFound("Resultado no encontrado");
      if (error.code === "22023") throw ApiError.validation("Estado inválido");
      throw ApiError.internal();
    }

    // El motivo del rechazo se registra en la bitácora (no en ai_results,
    // que es append-only de contenido). Si no hay tabla de actividad para
    // este recurso, se omite silenciosamente.
    if (body.estado === "RECHAZADO" && body.motivo) {
      const row = data as Record<string, unknown>;
      if (row.recurso_tipo === "licitacion" && row.recurso_id) {
        await ctx.supabase
          .from("actividad_log")
          .insert({
            licitacion_id: row.recurso_id,
            user_id: ctx.userId,
            accion: "ai_result_rechazado",
            metadata_json: { ai_result_id: params.id, tipo_analisis: row.tipo_analisis, motivo: body.motivo },
          })
          .then(() => {}, () => {});
      }
    }

    // P2 · I6 — bitácora inmutable de la revisión humana de un resultado de IA.
    await ctx.supabase
      .rpc("registrar_auditoria", {
        p_accion: "ai_result_revision",
        p_recurso_tipo: "ai_result",
        p_recurso_id: params.id,
        p_detalle: { estado: body.estado, motivo: body.motivo ?? null },
      })
      .then(() => {}, () => {});

    // Re-leer con la proyección pública.
    const { data: proyectado } = await ctx.supabase
      .from("ai_results")
      .select(AI_RESULT_COLUMNS)
      .eq("id", params.id)
      .maybeSingle();

    return { data: proyectado };
  },
);
