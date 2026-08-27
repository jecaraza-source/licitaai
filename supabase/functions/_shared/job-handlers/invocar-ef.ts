// P2 · Fase B — factory de handlers que ejecutan una operación de IA
// invocando su Edge Function existente en "modo job".
//
// Cada Edge Function de dominio (analizar-bases, auditar-documento, …)
// conserva su lógica tal cual (validación de esquema P0.6, escrituras en
// tablas de dominio, creación de checklist, actividad_log). Lo único que
// cambia: acepta `authenticate(req, { permitirJob: true })` y, cuando la
// invoca el worker, devuelve `_usage` (tokens/modelo) y opcionalmente
// `_citas` para la trazabilidad.
//
// El worker se encarga de: estado del job, reintentos, idempotencia,
// cancelación, notificación, conciliación de presupuesto (C3) y — si el
// flag `ai.versionado_resultados` está activo — persistir el resultado en
// ai_results (D3).
//
// Nota: la Edge Function invocada mantiene su propio límite de wall-clock
// (riesgo R1). El valor de esta capa es sacar la operación de la petición
// HTTP del cliente y darle estado/reintentos/idempotencia, no eliminar ese
// límite. Las operaciones que lo rebasen se re-parten en steps como
// procesar-documento (B1) en un incremento posterior.

import { isEnabled } from "../flags.ts";
import { conBreaker } from "../circuit-breaker.ts";
import type { JobContext, JobHandler, StepResult } from "../job-runner.ts";

// E3 — timeout duro por invocación de Edge Function de dominio. La EF tiene
// su propio límite de wall-clock; esto acota además lo que el worker
// espera, para no bloquear el tick entero si una EF cuelga.
const TIMEOUT_INVOKE_MS = Number(Deno.env.get("JOB_EF_TIMEOUT_MS") ?? "150000");

function conTimeout<T>(p: Promise<T>, ms: number, etiqueta: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) =>
      setTimeout(() => rej(Object.assign(new Error(`${etiqueta}: timeout tras ${ms}ms`), { name: "TimeoutError" })), ms)
    ),
  ]);
}

interface RespuestaEF {
  ok?: boolean;
  data?: unknown;
  error?: string;
  _usage?: { tokens_input?: number; tokens_output?: number; modelo?: string; provider?: string };
  _citas?: Array<Record<string, unknown>>;
  _nivel_confianza?: "ALTO" | "MEDIO" | "BAJO";
  _salida_incompleta?: boolean;
}

export function handlerInvocaEF(
  nombreEF: string,
  opts: { tipoAnalisis?: string; recursoDeInput?: (input: Record<string, unknown>) => { tipo: string; id: string } } = {},
): JobHandler {
  return async function handler(ctx: JobContext): Promise<StepResult> {
    const input = { ...(ctx.job.input_json ?? {}), job_id: ctx.job.id };
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Circuit breaker de Anthropic (proveedor dominante de estas
    // operaciones). Si el circuito está abierto, se lanza para que el
    // worker deje el job en RETRYING con backoff (no quema intentos).
    const res = await conBreaker<RespuestaEF>(
      ctx.service,
      "anthropic",
      async () => {
        const { data, error } = await conTimeout(
          ctx.service.functions.invoke(nombreEF, {
            body: input,
            headers: { Authorization: `Bearer ${serviceKey}` },
          }),
          TIMEOUT_INVOKE_MS,
          nombreEF,
        );
        if (error) {
          const status = (error as { context?: { status?: number } }).context?.status;
          const e = new Error(`${nombreEF}: ${error.message}`) as Error & { status?: number };
          if (typeof status === "number") e.status = status;
          throw e;
        }
        const body = (data ?? {}) as RespuestaEF;
        if (body.error) throw new Error(`${nombreEF}: ${body.error}`);
        return body;
      },
      { organizationId: ctx.job.organization_id },
    );

    const usage = res._usage ?? {};
    const modelo = usage.modelo ?? "claude-sonnet-5";
    const tokensInput = usage.tokens_input ?? 0;
    const tokensOutput = usage.tokens_output ?? 0;

    // Uso de IA en ai_usage_log (alimenta el tope diario de P0.6 y las
    // métricas). En modo job la EF corre con service_role y su propio
    // registrarUsoIA() —que usa auth.uid()— no puede escribir; lo hace aquí
    // el worker con la variante service-role y el org explícito del job.
    if (tokensInput > 0 || tokensOutput > 0) {
      const { error: eUso } = await ctx.service.rpc("registrar_uso_ia_worker", {
        p_organization_id: ctx.job.organization_id,
        p_user_id: ctx.job.requested_by,
        p_funcion: nombreEF,
        p_modelo: modelo,
        p_input_tokens: Math.max(0, Math.round(tokensInput) || 0),
        p_output_tokens: Math.max(0, Math.round(tokensOutput) || 0),
      });
      if (eUso) console.error(`[${nombreEF}] registrar_uso_ia_worker:`, eUso.message);
    }

    // Trazabilidad append-only (D3), tras el flag ai.versionado_resultados.
    if (opts.tipoAnalisis && opts.recursoDeInput) {
      const versionar = await isEnabled(ctx.service, "ai.versionado_resultados", {
        organizationId: ctx.job.organization_id,
      });
      if (versionar) {
        try {
          const recurso = opts.recursoDeInput(ctx.job.input_json ?? {});
          const docId =
            typeof (ctx.job.input_json as { documento_id?: string })?.documento_id === "string"
              ? (ctx.job.input_json as { documento_id?: string }).documento_id
              : null;
          await ctx.service.rpc("persistir_resultado_ia", {
            p_organization_id: ctx.job.organization_id,
            p_recurso_tipo: recurso.tipo,
            p_recurso_id: recurso.id,
            p_documento_id: docId,
            p_documento_sha256: null,
            p_tipo_analisis: opts.tipoAnalisis,
            p_prompt_template_id: nombreEF,
            p_provider: usage.provider ?? "anthropic",
            p_modelo: modelo,
            p_tokens_input: tokensInput,
            p_tokens_output: tokensOutput,
            p_costo_usd: null,
            p_latencia_ms: null,
            p_resultado_json: res.data ?? {},
            p_nivel_confianza: res._nivel_confianza ?? null,
            p_salida_incompleta: res._salida_incompleta ?? false,
            p_job_id: ctx.job.id,
            p_citas: res._citas ?? [],
            p_prompt_version: 1,
          });
        } catch (e) {
          console.error(`[${nombreEF}] persistir_resultado_ia:`, e);
        }
      }
    }

    return {
      completo: {
        resultRef: res.data ?? null,
        provider: usage.provider ?? "anthropic",
        modelo,
        tokensInput,
        tokensOutput,
      },
    };
  };
}
