// P2 · A2 — ejecución de un job (ADR 0002).
//
// El worker (job-worker/index.ts) reclama jobs y delega cada uno aquí.
// ejecutarUnJob() ejecuta UN step del handler correspondiente y traduce su
// resultado a la transición de estado adecuada vía las funciones de
// Postgres (completar_job / reencolar_step_job / fallar_job /
// marcar_job_cancelado). Los handlers de dominio (Fase B) se registran en
// HANDLERS.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { noopHandler } from "./job-handlers/noop.ts";
import { notificarJobSiCorresponde } from "./job-notify.ts";

export interface JobRow {
  id: string;
  organization_id: string;
  requested_by: string | null;
  tipo: string;
  recurso_tipo: string | null;
  recurso_id: string | null;
  estado: string;
  intentos: number;
  max_intentos: number;
  step_actual: string | null;
  input_json: Record<string, unknown>;
  result_ref: unknown;
  cancel_solicitada: boolean;
}

export interface JobContext {
  job: JobRow;
  service: SupabaseClient;
  /** Persiste progreso (0–100) y renueva el lease. Llamar en checkpoints
   * con salto >= 5% para no saturar Realtime. */
  reportarProgreso(progreso: number, detalle?: string): Promise<void>;
  /** Re-consulta cancel_solicitada. El handler debe llamarla en puntos de
   * checkpoint para soportar cancelación cooperativa. */
  cancelado(): Promise<boolean>;
  /** Se aborta al agotarse el presupuesto de tiempo del step. */
  signal: AbortSignal;
}

export interface StepResult {
  /** El job terminó por completo. */
  completo?: {
    resultRef: unknown;
    provider?: string;
    modelo?: string;
    tokensInput?: number;
    tokensOutput?: number;
    costo?: number;
  };
  /** El step terminó pero quedan más — el job vuelve a la cola. */
  siguienteStep?: { step: string; resultParcial?: unknown; progreso?: number };
}

export type JobHandler = (ctx: JobContext) => Promise<StepResult>;

/** Error que NO debe reintentarse (input inválido, recurso inexistente,
 * salida que no valida contra su esquema, etc.). */
export class ErrorNoReintentable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErrorNoReintentable";
  }
}

export const HANDLERS: Record<string, JobHandler> = {
  noop: noopHandler,
  // Fase B registra aquí: "procesar-documento", "analizar-bases",
  // "generar-estudio-mercado", "generar-preguntas-junta",
  // "generar-propuesta-tecnica", "auditar-documento",
  // "auditar-expediente", "seguimiento-analizar-fallo",
  // "analizar-documento-corporativo", "procesar-referencia-legal".
};

/** Clasificación mínima de errores. El incremento E1 (ADR 0005) la
 * reemplaza por la versión completa con circuit breakers. */
export function esReintentable(err: unknown): boolean {
  if (err instanceof ErrorNoReintentable) return false;

  const status =
    (err as { status?: number })?.status ?? (err as { statusCode?: number })?.statusCode;
  if (typeof status === "number") {
    if ([400, 401, 403, 404, 405, 409, 422].includes(status)) return false;
    if (status === 429 || status >= 500) return true;
  }

  const name = (err as Error)?.name ?? "";
  if (["AbortError", "TimeoutError"].includes(name)) return true;

  const msg = ((err as Error)?.message ?? "").toLowerCase();
  if (/timeout|econnreset|socket hang up|fetch failed|network|overloaded|rate.?limit/.test(msg)) {
    return true;
  }

  // Por defecto reintentar: fallar_job respeta max_intentos, así que un
  // error genuinamente permanente termina en FAILED igualmente.
  return true;
}

const STEP_BUDGET_MS = Number(Deno.env.get("JOB_STEP_BUDGET_MS") ?? "90000");

export type ResultadoEjecucion =
  | "COMPLETED"
  | "REQUEUED"
  | "CANCELLED"
  | "RETRYING_OR_FAILED"
  | "SKIPPED";

export async function ejecutarUnJob(
  service: SupabaseClient,
  job: JobRow,
): Promise<{ resultado: ResultadoEjecucion; detalle?: string }> {
  const handler = HANDLERS[job.tipo];
  if (!handler) {
    await service.rpc("fallar_job", {
      p_job_id: job.id,
      p_error_seguro: "Tipo de operación no soportado",
      p_error_interno_ref: `handler-missing:${job.tipo}`,
      p_reintentable: false,
    });
    return { resultado: "RETRYING_OR_FAILED", detalle: "handler ausente" };
  }

  if (job.cancel_solicitada) {
    await service.rpc("marcar_job_cancelado", { p_job_id: job.id });
    return { resultado: "CANCELLED" };
  }

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), STEP_BUDGET_MS);

  const ctx: JobContext = {
    job,
    service,
    signal: abort.signal,
    async reportarProgreso(progreso, detalle) {
      await service.rpc("progreso_job", {
        p_job_id: job.id,
        p_progreso: Math.max(0, Math.min(100, Math.round(progreso))),
        p_detalle: detalle ?? null,
      });
    },
    async cancelado() {
      const { data } = await service
        .from("jobs")
        .select("cancel_solicitada")
        .eq("id", job.id)
        .maybeSingle();
      return data?.cancel_solicitada === true;
    },
  };

  try {
    const res = await handler(ctx);

    if (await ctx.cancelado()) {
      await service.rpc("marcar_job_cancelado", { p_job_id: job.id });
      return { resultado: "CANCELLED" };
    }

    if (res.siguienteStep) {
      await service.rpc("reencolar_step_job", {
        p_job_id: job.id,
        p_step: res.siguienteStep.step,
        p_result_parcial: res.siguienteStep.resultParcial ?? null,
        p_progreso: res.siguienteStep.progreso ?? null,
      });
      return { resultado: "REQUEUED", detalle: res.siguienteStep.step };
    }

    if (res.completo) {
      const { data } = await service.rpc("completar_job", {
        p_job_id: job.id,
        p_result_ref: res.completo.resultRef ?? null,
        p_provider: res.completo.provider ?? null,
        p_modelo: res.completo.modelo ?? null,
        p_tokens_input: res.completo.tokensInput ?? 0,
        p_tokens_output: res.completo.tokensOutput ?? 0,
        p_costo: res.completo.costo ?? 0,
      });
      if (data) await notificarJobSiCorresponde(service, data);
      return { resultado: "COMPLETED" };
    }

    const { data: vacio } = await service.rpc("fallar_job", {
      p_job_id: job.id,
      p_error_seguro: "El procesamiento no produjo un resultado",
      p_error_interno_ref: `empty-result:${job.tipo}`,
      p_reintentable: false,
    });
    if (vacio) await notificarJobSiCorresponde(service, vacio);
    return { resultado: "RETRYING_OR_FAILED", detalle: "resultado vacío" };
  } catch (err) {
    const reintentable = esReintentable(err);
    const msg = err instanceof Error ? err.message : String(err);
    const { data } = await service.rpc("fallar_job", {
      p_job_id: job.id,
      p_error_seguro: reintentable
        ? "El procesamiento falló temporalmente y se reintentará automáticamente"
        : "El procesamiento no pudo completarse",
      p_error_interno_ref: msg.slice(0, 300),
      p_reintentable: reintentable,
    });
    if (data) await notificarJobSiCorresponde(service, data);
    return { resultado: "RETRYING_OR_FAILED", detalle: msg.slice(0, 120) };
  } finally {
    clearTimeout(timer);
  }
}
