import { createHash } from "node:crypto";

// Paso 17 del proceso operativo de Compras MX: "la persona que elaboró un
// documento no debería ser la única que lo valide". Lógica pura (sin
// Supabase) para poder probarla; getGateStatus la usa para decidir si la
// propuesta técnica y la económica tienen una revisión vigente.

export type AmbitoRevision = "TECNICA" | "ECONOMICA";

export type MotivoRevision =
  | "SIN_REVISOR"
  | "REVISOR_ES_AUTOR"
  | "SIN_CONFIRMAR"
  | "CONTENIDO_CAMBIO";

export interface RevisionPendiente {
  ambito: AmbitoRevision;
  motivo: MotivoRevision;
}

export const MENSAJE_MOTIVO: Record<MotivoRevision, string> = {
  SIN_REVISOR: "no tiene revisor asignado",
  REVISOR_ES_AUTOR: "el revisor es quien la elaboró",
  SIN_CONFIRMAR: "el revisor aún no confirma la revisión",
  CONTENIDO_CAMBIO: "cambió después de la revisión y debe revisarse de nuevo",
};

export const NOMBRE_AMBITO: Record<AmbitoRevision, string> = {
  TECNICA: "La propuesta técnica",
  ECONOMICA: "La propuesta económica",
};

export interface EstadoRevision {
  elaboradoPor: string | null;
  revisorId: string | null;
  revisadoAt: string | null;
  /** Huella del contenido que el revisor confirmó (solo económica). */
  hashRevisado?: string | null;
  /** Huella del contenido actual; si se omite no se compara (técnica: cada
   * cambio es una versión nueva, con su propia revisión). */
  hashActual?: string | null;
}

/** Devuelve por qué la revisión no vale todavía, o null si está vigente. */
export function motivoRevisionPendiente(r: EstadoRevision): MotivoRevision | null {
  if (!r.revisorId) return "SIN_REVISOR";
  if (r.elaboradoPor && r.revisorId === r.elaboradoPor) return "REVISOR_ES_AUTOR";
  if (!r.revisadoAt) return "SIN_CONFIRMAR";
  if (r.hashActual !== undefined && r.hashActual !== r.hashRevisado) return "CONTENIDO_CAMBIO";
  return null;
}

interface PartidaEconomica {
  descripcion: string | null;
  cantidad: number | string | null;
  unidad: string | null;
  precio_unitario_ofertado: number | string | null;
  subtotal: number | string | null;
  iva: number | string | null;
  total: number | string | null;
}

interface ConfigEconomica {
  tipo_precio: string | null;
  incluye_iva: boolean | null;
  moneda: string | null;
  condiciones_pago: string | null;
  tiempo_entrega_dias: number | null;
  validez_oferta_dias: number | null;
}

const num = (v: number | string | null | undefined, dec: number) =>
  v === null || v === undefined || v === "" ? null : Number(v).toFixed(dec);

/**
 * Huella estable del contenido económico. No usa los `id` de las partidas
 * (se reescriben al guardar) ni el orden de captura: dos hojas con las
 * mismas partidas y configuración dan el mismo hash.
 */
export function hashContenidoEconomico(
  partidas: PartidaEconomica[],
  config: ConfigEconomica | null,
): string {
  const filas = partidas
    .map((p) =>
      JSON.stringify([
        (p.descripcion ?? "").trim(),
        num(p.cantidad, 3),
        (p.unidad ?? "").trim(),
        num(p.precio_unitario_ofertado, 2),
        num(p.subtotal, 2),
        num(p.iva, 2),
        num(p.total, 2),
      ]),
    )
    .sort();
  const cfg = config
    ? [
        config.tipo_precio ?? null,
        config.incluye_iva ?? null,
        config.moneda ?? null,
        (config.condiciones_pago ?? "").trim(),
        config.tiempo_entrega_dias ?? null,
        config.validez_oferta_dias ?? null,
      ]
    : null;
  return createHash("sha256")
    .update(JSON.stringify({ filas, cfg }))
    .digest("hex");
}
