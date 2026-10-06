// §28 del proceso operativo de Compras MX — regla de trazabilidad: las 7
// preguntas que deben poder responderse de inmediato para cada requisito.
import type { EstadoChecklistItem } from "@/types";

export interface RequisitoTrazable {
  id: string;
  descripcion: string;
  estado: EstadoChecklistItem;
  padre_id: string | null;
  fuente: string | null;
  observaciones: string | null;
  documento_id: string | null;
  cargado_compras_mx: boolean;
  coincide_compras_mx: boolean;
  documentos: { nombre: string } | null;
  responsable: { nombre: string } | null;
}

export const PREGUNTAS = [
  { id: "donde_se_pidio", label: "¿Dónde se pidió?" },
  { id: "que_exige", label: "¿Qué exige exactamente?" },
  { id: "quien", label: "¿Quién lo atiende?" },
  { id: "con_que", label: "¿Con qué se acredita?" },
  { id: "donde_esta", label: "¿Dónde está?" },
  { id: "se_cargo", label: "¿Se cargó?" },
  { id: "coincide", label: "¿Coincide con Compras MX?" },
] as const;

/** Respuesta de cada pregunta, o null si aún no se puede responder. */
export function respuestasTrazabilidad(r: RequisitoTrazable): Record<(typeof PREGUNTAS)[number]["id"], string | null> {
  return {
    donde_se_pidio: r.fuente?.trim() || null,
    que_exige: r.descripcion.trim() || null,
    quien: r.responsable?.nombre ?? null,
    con_que: r.observaciones?.trim() || r.documentos?.nombre || null,
    donde_esta: r.documentos?.nombre ?? null,
    se_cargo: r.cargado_compras_mx ? "Sí" : "No",
    coincide: r.coincide_compras_mx ? "Sí" : "No",
  };
}

/** Cuántas de las 7 preguntas tienen respuesta afirmativa/completa. */
export function preguntasRespondidas(r: RequisitoTrazable): number {
  const resp = respuestasTrazabilidad(r);
  return PREGUNTAS.filter((p) => {
    const v = resp[p.id];
    return v !== null && v !== "No";
  }).length;
}

