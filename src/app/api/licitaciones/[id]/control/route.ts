import { z } from "zod";
import { apiRoute, ApiError, requireWriteRole } from "@/lib/api";
import { CAMPOS_EVENTO, validarCierreInterno } from "@/lib/compras-mx";

// Pasos 1–3 del proceso operativo de Compras MX: datos de registro del
// procedimiento, cierre interno anticipado y acción interna por evento.
// Ruta aparte de PATCH /licitaciones/[id] (que solo toca al convocante).

const paramsSchema = z.object({ id: z.string().uuid("id debe ser un UUID válido") });

const textoOpcional = (max: number) => z.string().trim().max(max).nullable().optional();

// Fechas de los eventos agregados al calendario (Paso 3). Las 7 originales
// no se editan por aquí: se capturan al crear la licitación.
const fechaEvento = z.string().datetime({ offset: true }).nullable().optional();

const patchSchema = z.object({
  fecha_limite_preguntas: fechaEvento,
  fecha_entrega_muestras: fechaEvento,
  fecha_firma_contrato: fechaEvento,
  fecha_garantia: fechaEvento,
  unidad_compradora: textoOpcional(300),
  numero_interno: textoOpcional(120),
  enlace_compras_mx: z
    .string()
    .trim()
    .max(2000)
    .refine((v) => v === "" || /^https?:\/\//i.test(v), "El enlace debe iniciar con http:// o https://")
    .nullable()
    .optional(),
  fecha_cierre_interno: z.string().datetime({ offset: true }).nullable().optional(),
  expediente_fuente_completo: z.boolean().optional(),
  acciones_internas: z.partialRecord(z.enum(CAMPOS_EVENTO), z.string().trim().max(300)).optional(),
});

export const PATCH = apiRoute({ paramsSchema, bodySchema: patchSchema }, async ({ ctx, params, body }) => {
  requireWriteRole(ctx);

  const { data: actual, error: errorLectura } = await ctx.supabase
    .from("licitaciones")
    .select("fecha_entrega_propuesta, fecha_cierre_interno, acciones_internas")
    .eq("id", params.id)
    .maybeSingle();
  if (errorLectura) throw ApiError.internal();
  if (!actual) throw ApiError.notFound("Licitación no encontrada");

  const cierre = body.fecha_cierre_interno !== undefined ? body.fecha_cierre_interno : actual.fecha_cierre_interno;
  const errorCierre = validarCierreInterno(cierre, actual.fecha_entrega_propuesta);
  if (errorCierre) throw ApiError.validation(errorCierre);

  const { acciones_internas, ...resto } = body;
  const update: Record<string, unknown> = Object.fromEntries(
    Object.entries(resto).map(([k, v]) => [k, v === "" ? null : v]).filter(([, v]) => v !== undefined),
  );
  if (acciones_internas) {
    // Mezcla con lo guardado: editar un evento no borra las acciones de los demás.
    const previas = (actual.acciones_internas ?? {}) as Record<string, string>;
    const mezcladas: Record<string, string> = { ...previas, ...acciones_internas };
    for (const [k, v] of Object.entries(mezcladas)) if (v === "") delete mezcladas[k];
    update.acciones_internas = mezcladas;
  }
  if (Object.keys(update).length === 0) throw ApiError.validation("No hay campos que actualizar");

  const { data, error } = await ctx.supabase
    .from("licitaciones")
    .update(update)
    .eq("id", params.id)
    .select(
      "unidad_compradora, numero_interno, enlace_compras_mx, fecha_cierre_interno, acciones_internas, expediente_fuente_completo, fecha_limite_preguntas, fecha_entrega_muestras, fecha_firma_contrato, fecha_garantia",
    )
    .single();
  if (error) throw ApiError.notFound("Licitación no encontrada");

  await ctx.supabase.from("actividad_log").insert({
    licitacion_id: params.id,
    user_id: ctx.userId,
    accion: "edicion",
    metadata_json: { campos: Object.keys(body), origen: "control_procedimiento" },
  });

  return { data };
});
