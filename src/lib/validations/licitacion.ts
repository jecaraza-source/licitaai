import { z } from "zod";

export const ESTADOS_LICITACION = [
  "NUEVA",
  "ANALISIS",
  "PREPARACION",
  "ENVIADA",
  "SEGUIMIENTO",
  "CERRADA",
] as const;

export const TIPOS_LICITACION = ["ADQUISICION", "SERVICIOS", "OBRA_PUBLICA"] as const;

export const ESTADOS_ID = ["FEDERAL", "EDOMEX", "CDMX"] as const;

export const SISTEMAS = ["COMPRANET", "EDCA", "SCA"] as const;

const optionalDateTime = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined))
  .refine((v) => v === undefined || !Number.isNaN(Date.parse(v)), {
    message: "Fecha inválida",
  });

export const licitacionSchema = z.object({
  numero_expediente: z.string().trim().min(1, "Requerido"),
  titulo: z.string().trim().min(1, "Requerido"),
  institucion: z.string().trim().min(1, "Requerido"),
  tipo: z.enum(TIPOS_LICITACION),
  estado_id: z.enum(ESTADOS_ID),
  sistema: z.enum(SISTEMAS),
  monto_maximo: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => (v === "" || v === undefined ? undefined : Number(v)))
    .refine((v) => v === undefined || (!Number.isNaN(v) && v >= 0), {
      message: "Monto inválido",
    }),
  fecha_publicacion: optionalDateTime,
  fecha_junta_aclaraciones: optionalDateTime,
  fecha_visita: optionalDateTime,
  fecha_entrega_propuesta: optionalDateTime,
  fecha_apertura_tecnica: optionalDateTime,
  fecha_apertura_economica: optionalDateTime,
  fecha_fallo: optionalDateTime,
});

export type LicitacionFormValues = z.input<typeof licitacionSchema>;
export type LicitacionInput = z.output<typeof licitacionSchema>;

export const estadoLicitacionSchema = z.object({
  estado_licitacion: z.enum(ESTADOS_LICITACION),
});
