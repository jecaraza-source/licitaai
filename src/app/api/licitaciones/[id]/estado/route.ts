import { z } from "zod";
import { apiRoute, ApiError, requireWriteRole } from "@/lib/api";
import { estadoLicitacionSchema } from "@/lib/validations/licitacion";
import { getGateStatus } from "@/lib/liberacion";

const paramsSchema = z.object({ id: z.string().uuid("id debe ser un UUID válido") });

export const POST = apiRoute(
  { paramsSchema, bodySchema: estadoLicitacionSchema },
  async ({ ctx, params, body }) => {
    requireWriteRole(ctx);

    if (body.estado_licitacion === "ENVIADA") {
      const gate = await getGateStatus(ctx.supabase, params.id);
      if (gate.bloqueado) {
        throw ApiError.conflict(
          "No se puede marcar como enviada: hay requisitos en rojo, requisitos críticos en amarillo o pendientes en el checklist de liberación.",
          { gate },
        );
      }
    }

    // Fallo aquí no debe bloquear el cambio de estado real — solo degrada
    // el metadata del log de actividad a estado_anterior: null. Mismo
    // comportamiento "best effort" que el código original.
    const { data: anterior } = await ctx.supabase
      .from("licitaciones")
      .select("estado_licitacion")
      .eq("id", params.id)
      .maybeSingle();

    const { data, error } = await ctx.supabase
      .from("licitaciones")
      .update({ estado_licitacion: body.estado_licitacion })
      .eq("id", params.id)
      .select()
      .single();

    if (error) throw ApiError.internal();

    await ctx.supabase.from("actividad_log").insert({
      licitacion_id: params.id,
      user_id: ctx.userId,
      accion: "cambio_estado",
      metadata_json: {
        estado_anterior: anterior?.estado_licitacion ?? null,
        nuevo_estado: body.estado_licitacion,
      },
    });

    // P2 · I6 — bitácora inmutable para el envío (acción crítica).
    if (body.estado_licitacion === "ENVIADA") {
      await ctx.supabase
        .rpc("registrar_auditoria", {
          p_accion: "licitacion_enviada",
          p_recurso_tipo: "licitacion",
          p_recurso_id: params.id,
          p_detalle: { estado_anterior: anterior?.estado_licitacion ?? null },
        })
        .then(() => {}, () => {});
    }

    return { data };
  },
);
