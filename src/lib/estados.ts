import { ESTADOS_LICITACION } from "@/lib/validations/licitacion";
import type { EstadoLicitacion } from "@/types";

// Lógica pura del ciclo de vida de una licitación: en qué orden se avanza y
// qué tipo de cambio es pasar de un estado a otro. Sin React ni Supabase, para
// poder probarla sin navegador. La API de estado no restringe las transiciones
// (corregir un error exige poder volver atrás); esta lógica sirve para que la
// pantalla avise antes de un cambio fuera de lo normal.

export const ETIQUETAS_ESTADO: Record<EstadoLicitacion, string> = {
  NUEVA: "Nueva",
  ANALISIS: "Análisis",
  PREPARACION: "Preparación",
  ENVIADA: "Enviada",
  SEGUIMIENTO: "Seguimiento",
  CERRADA: "Cerrada",
};

const indice = (e: EstadoLicitacion) => ESTADOS_LICITACION.indexOf(e);

/** Estado al que se avanza desde `estado` (null si ya es el último). */
export function siguienteEstado(estado: EstadoLicitacion): EstadoLicitacion | null {
  return ESTADOS_LICITACION[indice(estado) + 1] ?? null;
}

export type TipoCambioEstado = "avance" | "salto" | "retroceso";

/** Clasificación de un cambio de estado; null si no cambia nada. */
export function tipoCambioEstado(de: EstadoLicitacion, a: EstadoLicitacion): TipoCambioEstado | null {
  const dif = indice(a) - indice(de);
  if (dif === 0) return null;
  if (dif < 0) return "retroceso";
  return dif === 1 ? "avance" : "salto";
}

/** Estados que se omiten al saltar de `de` a `a` (vacío si no es un salto hacia delante). */
export function etapasOmitidas(de: EstadoLicitacion, a: EstadoLicitacion): EstadoLicitacion[] {
  if (tipoCambioEstado(de, a) !== "salto") return [];
  return ESTADOS_LICITACION.slice(indice(de) + 1, indice(a));
}

/**
 * Qué debe pasar antes de aplicar un cambio de estado:
 * - "bloqueado": se quiere enviar y faltan requisitos (se muestran en vez de intentar);
 * - "confirmar-envio": enviar sin pendientes conocidos, pide confirmar que ya se envió;
 * - "confirmar": retroceso o salto, pide confirmar;
 * - "directo": avance normal.
 */
export type PasoPrevio = "bloqueado" | "confirmar-envio" | "confirmar" | "directo";

export function pasoPrevio(de: EstadoLicitacion, a: EstadoLicitacion, pendientesDeEnvio: number): PasoPrevio {
  if (a === "ENVIADA" && de !== "ENVIADA") {
    // Volver atrás hacia ENVIADA desde SEGUIMIENTO/CERRADA no es un envío nuevo.
    if (tipoCambioEstado(de, a) === "retroceso") return "confirmar";
    return pendientesDeEnvio > 0 ? "bloqueado" : "confirmar-envio";
  }
  const tipo = tipoCambioEstado(de, a);
  return tipo === "retroceso" || tipo === "salto" ? "confirmar" : "directo";
}
