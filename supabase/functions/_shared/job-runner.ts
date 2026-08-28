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
import { procesarDocumentoHandler } from "./job-handlers/procesar-documento.ts";
import { exportarOrganizacionHandler } from "./job-handlers/exportar-organizacion.ts";
import { borrarOrganizacionHandler } from "./job-handlers/borrar-organizacion.ts";
import { handlerInvocaEF } from "./job-handlers/invocar-ef.ts";
import { CircuitoAbiertoError } from "./circuit-breaker.ts";
import { esReintentable } from "./retry.ts";
import { notificarJobSiCorresponde } from "./job-notify.ts";

const ESPERA_CIRCUITO_SEG = Number(Deno.env.get("CB_ABIERTO_SEGUNDOS") ?? "60") + 15;

const licDeInput = (i: Record<string, unknown>) => ({
  tipo: "licitacion",
  id: String(i.licitacion_id ?? ""),
});
const docDeInput = (i: Record<string, unknown>) => ({
  tipo: "documento",
  id: String(i.documento_id ?? ""),
});
const docCorpDeInput = (i: Record<string, unknown>) => ({
  tipo: "documento_corporativo",
  id: String(i.documento_id ?? ""),
});
const refDeInput = (i: Record<string, unknown>) => ({
  tipo: "referencia_legal",
  id: String(i.referencia_legal_id ?? ""),
});

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
  reserva_id: string | null;
}

/** Concilia (o libera) la reserva de presupuesto de IA del job, si tiene
 * una (C3, ADR 0004). Best-effort: no rompe la transición del job. */
async function cerrarPresupuesto(
  service: SupabaseClient,
  job: JobRow,
  desenlace:
    | { tipo: "conciliar"; tokensInput: number; tokensOutput: number; modelo: string }
    | { tipo: "liberar" },
): Promise<void> {
  if (!job.reserva_id) return;
  try {
    if (desenlace.tipo === "conciliar") {
      await service.rpc("conciliar_presupuesto_ia", {
        p_organization_id: job.organization_id,
        p_reserva_id: job.reserva_id,
        p_tokens_input: Math.max(0, Math.round(desenlace.tokensInput) || 0),
        p_tokens_output: Math.max(0, Math.round(desenlace.tokensOutput) || 0),
        p_modelo: desenlace.modelo || "claude-sonnet-5",
      });
    } else {
      await service.rpc("liberar_reserva_ia", {
        p_organization_id: job.organization_id,
        p_reserva_id: job.reserva_id,
      });
    }
  } catch (e) {
    console.error(`[job-runner] cerrarPresupuesto(${desenlace.tipo}) job ${job.id}:`, e);
  }
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

// La clasificación de errores y ErrorNoReintentable viven en retry.ts (E1),
// compartidas por withRetry y por el worker. Se re-exportan para no romper
// los imports existentes (noop.ts, procesar-documento.ts).
export { ErrorNoReintentable, esReintentable } from "./retry.ts";

export const HANDLERS: Record<string, JobHandler> = {
  noop: noopHandler,
  "noop-ef": handlerInvocaEF("test-echo", {
    tipoAnalisis: "analisis_bases",
    recursoDeInput: (i) => ({ tipo: "licitacion", id: String(i.licitacion_id ?? "") }),
  }), // prueba del wrapper invocar-ef
  "procesar-documento": procesarDocumentoHandler, // B1 (multi-step propio)
  "exportar-organizacion": exportarOrganizacionHandler, // H4 (multi-step propio, sin IA)
  "borrar-organizacion": borrarOrganizacionHandler, // H5 (multi-step orquestado, sin IA)

  // B2–B10: envuelven la Edge Function de dominio (que conserva su lógica).
  "analizar-bases": handlerInvocaEF("analizar-bases", {
    tipoAnalisis: "analisis_bases", recursoDeInput: licDeInput,
  }),
  "generar-estudio-mercado": handlerInvocaEF("generar-estudio-mercado", {
    tipoAnalisis: "estudio_mercado", recursoDeInput: licDeInput,
  }),
  "generar-preguntas-junta": handlerInvocaEF("generar-preguntas-junta", {
    tipoAnalisis: "junta_preguntas", recursoDeInput: licDeInput,
  }),
  "generar-propuesta-tecnica": handlerInvocaEF("generar-propuesta-tecnica", {
    tipoAnalisis: "propuesta_tecnica", recursoDeInput: licDeInput,
  }),
  "auditar-documento": handlerInvocaEF("auditar-documento", {
    tipoAnalisis: "auditoria_documento", recursoDeInput: docDeInput,
  }),
  "auditar-expediente": handlerInvocaEF("auditar-expediente", {
    tipoAnalisis: "auditoria_expediente", recursoDeInput: licDeInput,
  }),
  "seguimiento-analizar-fallo": handlerInvocaEF("analizar-fallo", {
    tipoAnalisis: "analisis_fallo", recursoDeInput: licDeInput,
  }),
  "analizar-documento-corporativo": handlerInvocaEF("analizar-documento-corporativo", {
    tipoAnalisis: "documento_corporativo", recursoDeInput: docCorpDeInput,
  }),
  // procesamiento del catálogo global (admin), sin ai_results ni recurso de organización
  "procesar-referencia-legal": handlerInvocaEF("procesar-referencia-legal"),
};

// refDeInput queda para cuando procesar-referencia-legal se scope-e por organización.
void refDeInput;


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
    await cerrarPresupuesto(service, job, { tipo: "liberar" });
    return { resultado: "RETRYING_OR_FAILED", detalle: "handler ausente" };
  }

  if (job.cancel_solicitada) {
    await service.rpc("marcar_job_cancelado", { p_job_id: job.id });
    await cerrarPresupuesto(service, job, { tipo: "liberar" });
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
      await cerrarPresupuesto(service, job, { tipo: "liberar" });
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
      await cerrarPresupuesto(service, job, {
        tipo: "conciliar",
        tokensInput: res.completo.tokensInput ?? 0,
        tokensOutput: res.completo.tokensOutput ?? 0,
        modelo: res.completo.modelo ?? "claude-sonnet-5",
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
    if (vacio?.estado === "FAILED") await cerrarPresupuesto(service, job, { tipo: "liberar" });
    if (vacio) await notificarJobSiCorresponde(service, vacio);
    return { resultado: "RETRYING_OR_FAILED", detalle: "resultado vacío" };
  } catch (err) {
    // Circuito abierto: no es culpa del job. Se re-encola con espera larga y
    // sin consumir presupuesto de reintentos (ADR 0005).
    if (err instanceof CircuitoAbiertoError) {
      await service.rpc("reencolar_por_espera", {
        p_job_id: job.id,
        p_segundos: ESPERA_CIRCUITO_SEG,
      });
      return { resultado: "RETRYING_OR_FAILED", detalle: `circuito abierto: ${err.provider}` };
    }

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
    // Solo se libera al llegar a FAILED (terminal); si es RETRYING, la
    // reserva se mantiene para el siguiente intento.
    if (data?.estado === "FAILED") await cerrarPresupuesto(service, job, { tipo: "liberar" });
    if (data) await notificarJobSiCorresponde(service, data);
    return { resultado: "RETRYING_OR_FAILED", detalle: msg.slice(0, 120) };
  } finally {
    clearTimeout(timer);
  }
}
