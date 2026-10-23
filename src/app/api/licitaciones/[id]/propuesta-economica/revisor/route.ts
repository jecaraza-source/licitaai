import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { apiRoute, ApiError, requireWriteRole } from "@/lib/api";
import { hashContenidoEconomico, motivoRevisionPendiente } from "@/lib/revision-independiente";

// Doble check (Paso 17) de la propuesta económica. A diferencia de la técnica
// (una fila versionada en `propuestas`), la hoja económica no tiene versión
// propia: la revisión se liga a la huella de su contenido, y si las partidas
// o la configuración cambian después de revisar, la revisión deja de valer.
// "Autor" = quien somete la hoja a revisión (quien asigna al revisor).

const paramsSchema = z.object({ id: z.string().uuid("id debe ser un UUID válido") });
const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("asignar"), revisor_id: z.string().uuid("revisor_id debe ser un UUID válido") }),
  z.object({ action: z.literal("confirmar") }),
]);

async function hashActual(supabase: SupabaseClient, licitacionId: string) {
  const [{ data: partidas }, { data: config }] = await Promise.all([
    supabase
      .from("propuesta_economica_partidas")
      .select("descripcion, cantidad, unidad, precio_unitario_ofertado, subtotal, iva, total")
      .eq("licitacion_id", licitacionId),
    supabase
      .from("propuesta_economica_config")
      .select("tipo_precio, incluye_iva, moneda, condiciones_pago, tiempo_entrega_dias, validez_oferta_dias")
      .eq("licitacion_id", licitacionId)
      .maybeSingle(),
  ]);
  return { hash: hashContenidoEconomico(partidas ?? [], config ?? null), partidas: (partidas ?? []).length };
}

export const GET = apiRoute({ paramsSchema }, async ({ ctx, params }) => {
  const [{ data: rev }, actual] = await Promise.all([
    ctx.supabase
      .from("revisiones_independientes")
      .select("elaborado_por, revisor_id, revisado_at, contenido_hash")
      .eq("licitacion_id", params.id)
      .eq("ambito", "ECONOMICA")
      .maybeSingle(),
    hashActual(ctx.supabase, params.id),
  ]);

  const motivo = motivoRevisionPendiente({
    elaboradoPor: rev?.elaborado_por ?? null,
    revisorId: rev?.revisor_id ?? null,
    revisadoAt: rev?.revisado_at ?? null,
    hashRevisado: rev?.contenido_hash ?? null,
    hashActual: actual.hash,
  });

  return {
    data: {
      elaborado_por: rev?.elaborado_por ?? null,
      revisor_id: rev?.revisor_id ?? null,
      revisado_at: rev?.revisado_at ?? null,
      vigente: motivo === null,
      motivo,
      hay_partidas: actual.partidas > 0,
    },
  };
});

export const POST = apiRoute({ paramsSchema, bodySchema }, async ({ ctx, params, body }) => {
  requireWriteRole(ctx);

  const actual = await hashActual(ctx.supabase, params.id);
  if (actual.partidas === 0) {
    throw ApiError.validation("Captura la propuesta económica antes de asignar un revisor");
  }

  if (body.action === "asignar") {
    if (body.revisor_id === ctx.userId) {
      throw ApiError.validation(
        "El revisor debe ser distinto de quien elaboró la propuesta (doble check, Paso 17)",
      );
    }
    const { data, error } = await ctx.supabase
      .from("revisiones_independientes")
      .upsert(
        {
          licitacion_id: params.id,
          ambito: "ECONOMICA",
          elaborado_por: ctx.userId,
          revisor_id: body.revisor_id,
          revisado_at: null,
          contenido_hash: null,
        },
        { onConflict: "licitacion_id,ambito" },
      )
      .select()
      .single();
    if (error) throw ApiError.internal();
    return { data };
  }

  // action === "confirmar"
  const { data: rev } = await ctx.supabase
    .from("revisiones_independientes")
    .select("id, revisor_id")
    .eq("licitacion_id", params.id)
    .eq("ambito", "ECONOMICA")
    .maybeSingle();

  if (!rev?.revisor_id) throw ApiError.validation("Asigna primero un revisor");
  if (rev.revisor_id !== ctx.userId) {
    throw ApiError.forbidden("Solo el revisor asignado puede confirmar la revisión");
  }

  const { data, error } = await ctx.supabase
    .from("revisiones_independientes")
    .update({ revisado_at: new Date().toISOString(), contenido_hash: actual.hash })
    .eq("id", rev.id)
    .select()
    .single();
  if (error) throw ApiError.internal();
  return { data };
});
