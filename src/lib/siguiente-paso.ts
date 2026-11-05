import type { GateStatus } from "@/lib/liberacion";
import { GRUPOS_PESTANAS, type PestanaLicitacion } from "@/lib/navegacion";
import type { EstadoLicitacion } from "@/types";

// Lógica pura del panel "Siguiente paso" de la ficha y de las insignias de
// pendientes en sus pestañas: a partir de la compuerta de liberación
// (`GET /api/licitaciones/[id]/liberacion`) decide qué falta para poder enviar,
// en qué orden conviene resolverlo y a qué pestaña lleva cada cosa. Sin React
// ni Supabase, para poder probarla sin navegador.

export interface PasoPendiente {
  clave: "analisis-ia" | "auditoria" | "revision-tecnica" | "revision-economica" | "liberacion" | "autorizacion";
  /** Qué falta, en una línea. */
  texto: string;
  /** Pestaña donde se resuelve. */
  pestana: PestanaLicitacion;
  /** Cuántos pendientes aporta a la insignia de esa pestaña. */
  cantidad: number;
}

const MOTIVO_REVISION: Record<string, string> = {
  SIN_REVISOR: "no tiene revisor asignado",
  REVISOR_ES_AUTOR: "el revisor es quien la elaboró",
  SIN_CONFIRMAR: "el revisor aún no confirma",
  CONTENIDO_CAMBIO: "cambió después de la revisión",
};

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/**
 * Lo que falta para poder enviar, en el orden en que conviene resolverlo:
 * primero revisar lo que generó la IA, luego los requisitos en rojo, la
 * revisión independiente de las propuestas, el checklist de liberación y, al
 * final, la autorización del supervisor. Vacío si la compuerta está libre.
 */
export function pasosPendientes(gate: GateStatus): PasoPendiente[] {
  const pasos: PasoPendiente[] = [];

  if (gate.gateAprobacionIaActivo && gate.analisisIaSinRevisar.length > 0) {
    const n = gate.analisisIaSinRevisar.length;
    pasos.push({
      clave: "analisis-ia",
      texto: `${n} análisis de IA por aprobar o rechazar`,
      pestana: "analisis",
      cantidad: n,
    });
  }

  const criticos = gate.rojos + gate.amarillosCriticos;
  if (criticos > 0) {
    const partes = [
      gate.rojos > 0 ? plural(gate.rojos, "requisito en rojo", "requisitos en rojo") : null,
      gate.amarillosCriticos > 0
        ? plural(gate.amarillosCriticos, "crítico en amarillo", "críticos en amarillo")
        : null,
    ].filter(Boolean);
    pasos.push({ clave: "auditoria", texto: partes.join(" y "), pestana: "auditoria", cantidad: criticos });
  }

  if (gate.revisionIndependiente.activo) {
    for (const p of gate.revisionIndependiente.pendientes) {
      const tecnica = p.ambito === "TECNICA";
      pasos.push({
        clave: tecnica ? "revision-tecnica" : "revision-economica",
        texto: `La propuesta ${tecnica ? "técnica" : "económica"} ${MOTIVO_REVISION[p.motivo] ?? "requiere revisión"}`,
        pestana: tecnica ? "propuesta-tecnica" : "propuesta-economica",
        cantidad: 1,
      });
    }
  }

  if (gate.pendientesLiberacion > 0) {
    pasos.push({
      clave: "liberacion",
      texto: `${plural(gate.pendientesLiberacion, "punto", "puntos")} del checklist de liberación sin confirmar`,
      pestana: "liberacion",
      cantidad: gate.pendientesLiberacion,
    });
  }

  if (!gate.jerarquiaAutorizada) {
    pasos.push({
      clave: "autorizacion",
      texto: "Falta la autorización del supervisor",
      pestana: "liberacion",
      cantidad: 1,
    });
  }

  return pasos;
}

/** Pendientes por pestaña (solo las que tienen alguno). */
export function pendientesPorPestana(pasos: PasoPendiente[]): Record<PestanaLicitacion, number> {
  const por: Record<PestanaLicitacion, number> = {};
  for (const p of pasos) por[p.pestana] = (por[p.pestana] ?? 0) + p.cantidad;
  return por;
}

/** Pendientes por grupo de pestañas (clave: etiqueta del grupo). */
export function pendientesPorGrupo(pasos: PasoPendiente[]): Record<string, number> {
  const porPestana = pendientesPorPestana(pasos);
  const por: Record<string, number> = {};
  for (const g of GRUPOS_PESTANAS) {
    const n = g.tabs.reduce((suma, t) => suma + (porPestana[t.value] ?? 0), 0);
    if (n > 0) por[g.label] = n;
  }
  return por;
}

/** La compuerta solo importa mientras la licitación no se ha enviado. */
export function compuertaRelevante(estado: EstadoLicitacion): boolean {
  return estado === "NUEVA" || estado === "ANALISIS" || estado === "PREPARACION";
}

// --- Fecha de entrega ---

const ZONA = "America/Mexico_City";

/** Día calendario (AAAA-MM-DD) de un instante, en hora de Ciudad de México. */
function diaMx(instante: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instante);
}

/**
 * Días naturales (hora de Ciudad de México) de `hoy` a la fecha de entrega:
 * 0 es hoy, negativo es vencida. `null` si no hay fecha o no es válida.
 */
export function diasParaEntrega(fecha: string | null | undefined, hoy: Date): number | null {
  if (!fecha) return null;
  const entrega = new Date(fecha);
  if (Number.isNaN(entrega.getTime())) return null;
  const [ya, ma, da] = diaMx(entrega).split("-").map(Number);
  const [yh, mh, dh] = diaMx(hoy).split("-").map(Number);
  return Math.round((Date.UTC(ya, ma - 1, da) - Date.UTC(yh, mh - 1, dh)) / 86_400_000);
}

export type TonoEntrega = "vencida" | "urgente" | "proxima" | "holgada" | "sin-fecha";

export function estadoEntrega(dias: number | null): { etiqueta: string; tono: TonoEntrega } {
  if (dias === null) return { etiqueta: "Sin fecha de entrega", tono: "sin-fecha" };
  if (dias < 0) {
    return { etiqueta: `Venció hace ${plural(-dias, "día", "días")}`, tono: "vencida" };
  }
  if (dias === 0) return { etiqueta: "Se entrega hoy", tono: "urgente" };
  if (dias === 1) return { etiqueta: "Se entrega mañana", tono: "urgente" };
  return { etiqueta: `Faltan ${dias} días para la entrega`, tono: dias <= 3 ? "urgente" : dias <= 7 ? "proxima" : "holgada" };
}

/** Titular del panel: qué falta o que ya se puede enviar. */
export function titularSiguientePaso(gate: GateStatus, pasos: PasoPendiente[]): string {
  if (!gate.bloqueado) return "Todo listo para enviar";
  // `bloqueado` y `pasos` salen de las mismas reglas; si alguna vez divergieran,
  // el titular no debe afirmar que no falta nada.
  if (pasos.length === 0) return "Revisa la compuerta de liberación";
  return pasos.length === 1 ? "Falta 1 cosa para enviar" : `Faltan ${pasos.length} cosas para enviar`;
}
