import { z } from "zod";
import { apiRoute, ApiError, requireWriteRole } from "@/lib/api";

const paramsSchema = z.object({ id: z.string().uuid("id debe ser un UUID válido") });

const numeroOrNull = z.union([z.number(), z.null()]).optional();

const partidaSchema = z.object({
  partida_id: z.string().uuid().nullable().optional(),
  descripcion: z.string().nullable().optional(),
  cantidad: numeroOrNull,
  unidad: z.string().nullable().optional(),
  precio_unitario_ofertado: numeroOrNull,
  subtotal: numeroOrNull,
  iva: numeroOrNull,
  total: numeroOrNull,
  margen_porcentaje: numeroOrNull,
  precio_referencia_mercado: numeroOrNull,
  cantidad_compras_mx: numeroOrNull,
  precio_unitario_compras_mx: numeroOrNull,
  total_compras_mx: numeroOrNull,
});

const configSchema = z
  .object({
    tipo_precio: z.string().nullable(),
    incluye_iva: z.boolean(),
    moneda: z.string().nullable(),
    condiciones_pago: z.string().nullable(),
    tiempo_entrega_dias: numeroOrNull,
    validez_oferta_dias: numeroOrNull,
  })
  .partial();

const putBodySchema = z.object({
  config: configSchema.optional(),
  partidas: z.array(partidaSchema).optional(),
});

export const GET = apiRoute({ paramsSchema }, async ({ ctx, params }) => {
  const [{ data: config }, { data: partidasEconomicas }, { data: partidas }, { data: estudios }] =
    await Promise.all([
      ctx.supabase
        .from("propuesta_economica_config")
        .select("*")
        .eq("licitacion_id", params.id)
        .maybeSingle(),
      ctx.supabase.from("propuesta_economica_partidas").select("*").eq("licitacion_id", params.id),
      ctx.supabase.from("partidas").select("*").eq("licitacion_id", params.id).order("numero"),
      ctx.supabase.from("estudio_mercado").select("*").eq("licitacion_id", params.id),
    ]);

  // Si aún no hay renglones de propuesta económica, se inicializan desde las
  // partidas detectadas (con el precio de referencia del estudio de mercado).
  let filas = partidasEconomicas ?? [];
  if (filas.length === 0 && partidas && partidas.length > 0) {
    const estudiosPorPartida = new Map((estudios ?? []).map((e) => [e.partida_id, e]));
    filas = partidas.map((p) => {
      const estudio = estudiosPorPartida.get(p.id);
      const referencia = estudio?.precio_recomendado ?? p.precio_unitario_referencia ?? null;
      return {
        id: crypto.randomUUID(),
        licitacion_id: params.id,
        partida_id: p.id,
        descripcion: p.descripcion,
        cantidad: p.cantidad,
        unidad: p.unidad,
        precio_unitario_ofertado: null,
        subtotal: null,
        iva: null,
        total: null,
        margen_porcentaje: null,
        precio_referencia_mercado: referencia,
        cantidad_compras_mx: null,
        precio_unitario_compras_mx: null,
        total_compras_mx: null,
        _nueva: true,
      };
    });
  }

  return {
    data: {
      config: config ?? {
        tipo_precio: null,
        incluye_iva: true,
        moneda: "MXN",
        condiciones_pago: null,
        tiempo_entrega_dias: null,
        validez_oferta_dias: null,
      },
      partidas: filas,
    },
  };
});

export const PUT = apiRoute({ paramsSchema, bodySchema: putBodySchema }, async ({ ctx, params, body }) => {
  requireWriteRole(ctx);

  // Sin transacción: si el insert de partidas falla tras el delete, se
  // pierden las partidas capturadas — mismo comportamiento que el código
  // original; envolver esto en una operación atómica es alcance de P1.2.
  if (body.config) {
    const { data: existente } = await ctx.supabase
      .from("propuesta_economica_config")
      .select("id")
      .eq("licitacion_id", params.id)
      .maybeSingle();

    if (existente) {
      await ctx.supabase.from("propuesta_economica_config").update(body.config).eq("id", existente.id);
    } else {
      await ctx.supabase
        .from("propuesta_economica_config")
        .insert({ licitacion_id: params.id, ...body.config });
    }
  }

  if (body.partidas) {
    await ctx.supabase.from("propuesta_economica_partidas").delete().eq("licitacion_id", params.id);
    if (body.partidas.length > 0) {
      const filas = body.partidas.map((p) => ({
        licitacion_id: params.id,
        partida_id: p.partida_id ?? null,
        descripcion: p.descripcion,
        cantidad: p.cantidad,
        unidad: p.unidad,
        precio_unitario_ofertado: p.precio_unitario_ofertado,
        subtotal: p.subtotal,
        iva: p.iva,
        total: p.total,
        margen_porcentaje: p.margen_porcentaje,
        precio_referencia_mercado: p.precio_referencia_mercado,
        cantidad_compras_mx: p.cantidad_compras_mx ?? null,
        precio_unitario_compras_mx: p.precio_unitario_compras_mx ?? null,
        total_compras_mx: p.total_compras_mx ?? null,
      }));
      const { error } = await ctx.supabase.from("propuesta_economica_partidas").insert(filas);
      if (error) throw ApiError.internal();
    }
  }

  return { data: { ok: true } };
});
