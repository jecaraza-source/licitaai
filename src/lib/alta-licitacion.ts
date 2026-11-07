import type { LicitacionFormValues } from "@/lib/validations/licitacion";

// Lógica pura del alta de licitación en pasos (sin React, para probarla sin
// navegador): qué pasos hay, qué campos valida cada uno antes de avanzar y a
// dónde se aterriza al guardar.

type Campo = keyof LicitacionFormValues;

export interface PasoAlta {
  id: string;
  titulo: string;
  /** Texto corto bajo el título del paso. */
  descripcion: string;
  /** Campos que se validan antes de pasar al siguiente. */
  campos: readonly Campo[];
  opcional?: boolean;
}

export const FECHAS_ALTA = [
  { name: "fecha_publicacion", label: "Publicación" },
  { name: "fecha_limite_preguntas", label: "Límite de preguntas" },
  { name: "fecha_junta_aclaraciones", label: "Junta de aclaraciones" },
  { name: "fecha_visita", label: "Visita a instalaciones" },
  { name: "fecha_entrega_muestras", label: "Entrega de muestras" },
  { name: "fecha_entrega_propuesta", label: "Entrega de propuesta" },
  { name: "fecha_apertura_tecnica", label: "Apertura técnica" },
  { name: "fecha_apertura_economica", label: "Apertura económica" },
  { name: "fecha_fallo", label: "Fallo" },
  { name: "fecha_firma_contrato", label: "Firma de contrato" },
  { name: "fecha_garantia", label: "Garantía" },
] as const satisfies ReadonlyArray<{ name: Campo; label: string }>;

export const PASOS_ALTA: readonly PasoAlta[] = [
  {
    id: "datos",
    titulo: "Datos generales",
    descripcion: "Cómo identificar la licitación.",
    campos: ["numero_expediente", "institucion", "titulo"],
  },
  {
    id: "clasificacion",
    titulo: "Clasificación y monto",
    descripcion: "Tipo, modalidad y jurisdicción.",
    campos: ["tipo", "modalidad_procedimiento", "monto_maximo", "estado_id", "sistema"],
  },
  {
    id: "fechas",
    titulo: "Fechas del procedimiento",
    descripcion: "Opcional: puedes completarlas después en «Fechas clave».",
    campos: FECHAS_ALTA.map((f) => f.name),
    opcional: true,
  },
];

export const ULTIMO_PASO_ALTA = PASOS_ALTA.length - 1;

/** Índice del paso que contiene un campo (el primero con error al enviar). */
export function pasoDeCampo(campo: string): number {
  const i = PASOS_ALTA.findIndex((p) => (p.campos as readonly string[]).includes(campo));
  return i === -1 ? 0 : i;
}

/** El primer paso con un error entre los campos dados (0 si no hay ninguno). */
export function primerPasoConError(camposConError: readonly string[]): number {
  if (camposConError.length === 0) return 0;
  return Math.min(...camposConError.map(pasoDeCampo));
}

/**
 * A dónde ir tras crear la licitación: lo primero que se hace con una nueva es
 * reunir sus documentos (convocatoria y bases), así que se aterriza ahí en vez
 * de en un Resumen vacío.
 */
export function hrefTrasCrear(licitacionId: string): string {
  return `/licitaciones/${licitacionId}?tab=documentos`;
}
