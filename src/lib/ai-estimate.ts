import type { JobTipo } from "@/lib/validations/jobs";

// P2 · C2 — estimación de tokens/costo de una operación de IA, para
// reservar presupuesto antes de ejecutarla (ADR 0004).
//
// Los factores son conservadores y aproximados a propósito: el error de
// estimación (estimado vs real, visible en ai_budget_ledger) se recalibra
// mensualmente (ADR 0004 §consecuencias, riesgo R3). Sobre-estimar bloquea
// jobs legítimos; sub-estimar deja pasar gasto — se prefiere sobre-estimar
// un poco y conciliar hacia abajo.

export interface EstimacionIA {
  /** Modelo con el que se estima el costo (según la política económica por
   * defecto). El modelo REAL lo elige el handler; la conciliación posterior
   * ajusta al costo real. */
  modelo: string;
  inputTokens: number;
  outputTokens: number;
}

interface FactorOperacion {
  modelo: string;
  /** tokens de entrada fijos (prompt + contexto típico) */
  inputBase: number;
  /** tokens de salida típicos */
  outputBase: number;
  /** tokens de entrada adicionales por byte del documento de entrada */
  inputPorByte?: number;
  /** tokens de salida adicionales por byte */
  outputPorByte?: number;
}

// "economico_por_defecto": extracción/clasificación con el modelo barato.
const FACTORES: Record<string, FactorOperacion> = {
  "procesar-documento": {
    // embeddings (text-embedding-3-small) dominan; se añade margen por una
    // posible pasada de visión si el PDF está escaneado.
    modelo: "text-embedding-3-small",
    inputBase: 2_000,
    outputBase: 0,
    inputPorByte: 0.35,
    outputPorByte: 0.02,
  },
  "analizar-bases": { modelo: "claude-sonnet-5", inputBase: 25_000, outputBase: 4_000 },
  "generar-estudio-mercado": { modelo: "claude-sonnet-5", inputBase: 20_000, outputBase: 5_000 },
  "generar-preguntas-junta": { modelo: "claude-sonnet-5", inputBase: 15_000, outputBase: 3_000 },
  "generar-propuesta-tecnica": { modelo: "claude-sonnet-5", inputBase: 18_000, outputBase: 14_000 },
  "auditar-documento": { modelo: "claude-sonnet-5", inputBase: 12_000, outputBase: 2_500 },
  "auditar-expediente": { modelo: "claude-sonnet-5", inputBase: 20_000, outputBase: 4_000 },
  "seguimiento-analizar-fallo": { modelo: "claude-sonnet-5", inputBase: 12_000, outputBase: 2_500 },
  "analizar-documento-corporativo": { modelo: "claude-sonnet-5", inputBase: 10_000, outputBase: 2_000 },
  "procesar-referencia-legal": {
    modelo: "text-embedding-3-small",
    inputBase: 2_000, outputBase: 0, inputPorByte: 0.35, outputPorByte: 0.02,
  },
  noop: { modelo: "text-embedding-3-small-mock", inputBase: 0, outputBase: 0 },
};

export function estimarOperacion(
  tipo: JobTipo,
  opts: { bytes?: number } = {},
): EstimacionIA {
  const f = FACTORES[tipo] ?? { modelo: "claude-sonnet-5", inputBase: 20_000, outputBase: 4_000 };
  const bytes = Math.max(0, opts.bytes ?? 0);
  return {
    modelo: f.modelo,
    inputTokens: Math.round(f.inputBase + bytes * (f.inputPorByte ?? 0)),
    outputTokens: Math.round(f.outputBase + bytes * (f.outputPorByte ?? 0)),
  };
}
