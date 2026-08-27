import type { PostgrestError } from "@supabase/supabase-js";
import { ApiError } from "@/lib/api";
import type { ApiContext } from "@/lib/api";
import type { JobTipo } from "@/lib/validations/jobs";
import type { Job } from "@/types";
import { estimarOperacion } from "@/lib/ai-estimate";
import { isEnabled } from "@/lib/flags";

// P2 · A4 — helper de servidor para crear/leer jobs. Lo usan la ruta
// /api/jobs y, en Fase B, las rutas de dominio cuando su flag async está
// activo. La forma pública `Job` vive en @/types (sin dependencias de
// servidor) para poder usarse también en el cliente (<JobStatus>).

const CAMPOS_PUBLICOS: (keyof Job)[] = [
  "id", "tipo", "recurso_tipo", "recurso_id", "estado", "prioridad", "progreso",
  "progreso_detalle", "step_actual", "intentos", "max_intentos", "provider", "modelo",
  "tokens_input", "tokens_output", "costo_real_usd", "result_ref", "error_seguro",
  "reused_from", "created_at", "authorized_at", "started_at", "finished_at", "expires_at",
];

/** Proyecta una fila cruda de `jobs` a la forma pública (omite input_json,
 * error_interno_ref, worker_id, reserva_id, lease, next_attempt_at, etc.). */
export function proyectarJobPublico(row: Record<string, unknown>): Job {
  const salida = {} as Record<string, unknown>;
  for (const campo of CAMPOS_PUBLICOS) salida[campo] = row[campo] ?? null;
  return salida as unknown as Job;
}

/** Traduce el error de una función de Postgres de jobs a una ApiError
 * segura. `crear_job`/`cancelar_job` lanzan con errcodes:
 *   P0002 -> recurso/job no encontrado
 *   42501 -> perfil sin organización
 *   28000 -> no autenticado (no debería llegar: apiRoute ya autenticó)
 */
export function mapearErrorRpcJob(error: PostgrestError): ApiError {
  switch (error.code) {
    case "P0002":
      return ApiError.notFound(/job/i.test(error.message) ? "Job no encontrado" : "Recurso no encontrado");
    case "42501":
      return ApiError.forbidden("Tu perfil no tiene una organización asociada");
    case "28000":
      return ApiError.unauthenticated();
    case "23505": // unique_violation en idempotency_key con carrera
      return ApiError.conflict("Ya existe un job con esa clave de idempotencia");
    default:
      return ApiError.internal();
  }
}

export interface CrearJobParams {
  tipo: JobTipo;
  recurso_tipo?: string;
  recurso_id?: string;
  input?: Record<string, unknown>;
  idempotency_key?: string;
  prioridad?: number;
  dedup_hash?: string;
  max_intentos?: number;
  /** Reserva de presupuesto de IA asociada (C2), si `ai.gobierno_costo`
   * está activo. El worker la concilia/libera al terminar el job. */
  reserva_id?: string;
}

/** Traduce los `hint` de reservar_presupuesto_ia a una ApiError con código
 * AI_BUDGET_EXCEEDED (el frontend puede mostrar un aviso de upgrade). */
function mapearErrorPresupuesto(error: PostgrestError): ApiError {
  const hint = error.hint ?? "";
  if (hint.includes("limite_por_operacion")) {
    return ApiError.aiBudgetExceeded(
      "Esta operación excede el límite de gasto de IA por operación de tu organización.",
    );
  }
  if (hint.includes("limite_diario")) {
    return ApiError.aiBudgetExceeded(
      "Se alcanzó el límite diario de gasto de IA de tu organización. Intenta de nuevo mañana.",
    );
  }
  if (hint.includes("cuota_mensual")) {
    return ApiError.aiBudgetExceeded("Se agotó la cuota mensual de IA de tu organización.");
  }
  return ApiError.internal();
}

/** Reserva presupuesto para una operación de IA (ADR 0004). Devuelve el
 * reserva_id, o lanza AI_BUDGET_EXCEEDED. Solo se llama cuando el flag
 * `ai.gobierno_costo` está activo para la organización. */
export async function reservarPresupuestoIA(
  ctx: ApiContext,
  tipo: JobTipo,
  opts: { bytes?: number; jobId?: string } = {},
): Promise<string> {
  const est = estimarOperacion(tipo, { bytes: opts.bytes });
  const { data: usd, error: e1 } = await ctx.supabase.rpc("estimar_costo_ia", {
    p_modelo: est.modelo,
    p_tokens_input: est.inputTokens,
    p_tokens_output: est.outputTokens,
  });
  if (e1) throw ApiError.internal();

  const { data: reservaId, error: e2 } = await ctx.supabase.rpc("reservar_presupuesto_ia", {
    p_tipo: tipo,
    p_estimado_usd: usd,
    p_job_id: opts.jobId ?? null,
  });
  if (e2) throw mapearErrorPresupuesto(e2);
  return reservaId as string;
}

/** Libera una reserva propia (best-effort) — p. ej. si crear el job falla
 * después de haber reservado. */
export async function liberarMiReserva(ctx: ApiContext, reservaId: string): Promise<void> {
  const { error } = await ctx.supabase.rpc("liberar_mi_reserva_ia", { p_reserva_id: reservaId });
  if (error) console.error("[jobs] liberar_mi_reserva_ia:", error.message);
}

/**
 * Helper para las rutas de operaciones de IA (Fase B): si el flag async de
 * la operación está activo, crea el job (con reserva de presupuesto) y
 * devuelve `{job_id, ...}` para responder 202; si no, devuelve null y la
 * ruta sigue con su comportamiento síncrono.
 *
 * La idempotency_key incluye un bucket de ~2 min: un doble clic no crea dos
 * jobs, pero un reintento deliberado más tarde sí.
 */
export async function encolarOperacionIA(
  ctx: ApiContext,
  opts: {
    flag: string;
    tipo: JobTipo;
    recursoTipo: "licitacion" | "documento" | "documento_corporativo" | "checklist_item";
    recursoId: string;
    input: Record<string, unknown>;
    bytes?: number;
  },
): Promise<{ job_id: string; estado: string; async: true } | null> {
  const activo = await isEnabled(ctx.supabase, opts.flag, { organizationId: ctx.organizationId });
  if (!activo) return null;

  const bucket = Math.floor(Date.now() / 120_000);
  const docId = (opts.input.documento_id as string | undefined) ?? "";
  const { job } = await crearJobConPresupuesto(
    ctx,
    {
      tipo: opts.tipo,
      recurso_tipo: opts.recursoTipo,
      recurso_id: opts.recursoId,
      idempotency_key: `${opts.tipo}:${opts.recursoId}:${docId}:${bucket}`,
      input: opts.input,
    },
    { bytes: opts.bytes },
  );
  return { job_id: job.id, estado: job.estado, async: true };
}

/** Busca un job existente por (organización, idempotency_key) sin crearlo. */
export async function buscarJobPorIdempotencyKey(
  ctx: ApiContext,
  key: string,
): Promise<Job | null> {
  const { data } = await ctx.supabase
    .from("jobs")
    .select("*")
    .eq("idempotency_key", key)
    .maybeSingle();
  return data ? proyectarJobPublico(data as unknown as Record<string, unknown>) : null;
}

/** Envuelve reserva → crear job → (si falla) liberar. Usa el flag
 * `ai.gobierno_costo`. Devuelve el job y si fue nuevo. */
export async function crearJobConPresupuesto(
  ctx: ApiContext,
  params: CrearJobParams,
  opts: { bytes?: number } = {},
): Promise<{ job: Job; nuevo: boolean }> {
  const gobierno = await isEnabled(ctx.supabase, "ai.gobierno_costo", {
    organizationId: ctx.organizationId,
  });
  if (!gobierno) return crearJob(ctx, params);

  // Idempotencia: si el job ya existe, devolverlo sin reservar de nuevo.
  if (params.idempotency_key) {
    const existente = await buscarJobPorIdempotencyKey(ctx, params.idempotency_key);
    if (existente) return { job: existente, nuevo: false };
  }

  const reservaId = await reservarPresupuestoIA(ctx, params.tipo, opts);
  try {
    return await crearJob(ctx, { ...params, reserva_id: reservaId });
  } catch (e) {
    await liberarMiReserva(ctx, reservaId);
    throw e;
  }
}

/** Crea (o recupera, si la idempotency_key coincide) un job vía la función
 * SECURITY DEFINER crear_job. Devuelve el job proyectado + si fue nuevo. */
export async function crearJob(
  ctx: ApiContext,
  params: CrearJobParams,
): Promise<{ job: Job; nuevo: boolean }> {
  // Pre-check de idempotencia (RLS lo acota a la propia organización) para
  // poder responder 200 vs 201. Si dos requests idénticas corren a la vez y
  // ambas pasan este check, el índice único hace que el segundo crear_job
  // devuelva 23505 -> CONFLICT (aceptable: caso raro de carrera).
  if (params.idempotency_key) {
    const { data: existente } = await ctx.supabase
      .from("jobs")
      .select("*")
      .eq("idempotency_key", params.idempotency_key)
      .maybeSingle();
    if (existente) {
      return { job: proyectarJobPublico(existente as unknown as Record<string, unknown>), nuevo: false };
    }
  }

  const { data, error } = await ctx.supabase.rpc("crear_job", {
    p_tipo: params.tipo,
    p_recurso_tipo: params.recurso_tipo ?? null,
    p_recurso_id: params.recurso_id ?? null,
    p_input: params.input ?? {},
    p_idempotency_key: params.idempotency_key ?? null,
    p_prioridad: params.prioridad ?? 100,
    p_dedup_hash: params.dedup_hash ?? null,
    p_max_intentos: params.max_intentos ?? 3,
    p_reserva_id: params.reserva_id ?? null,
  });

  if (error) throw mapearErrorRpcJob(error);
  if (!data) throw ApiError.internal();

  return { job: proyectarJobPublico(data as Record<string, unknown>), nuevo: true };
}
