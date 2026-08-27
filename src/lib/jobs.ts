import type { PostgrestError } from "@supabase/supabase-js";
import { ApiError } from "@/lib/api";
import type { ApiContext } from "@/lib/api";
import type { JobTipo } from "@/lib/validations/jobs";

// P2 · A4 — helper de servidor para crear/leer jobs. Lo usan la ruta
// /api/jobs y, en Fase B, las rutas de dominio cuando su flag async está
// activo.

/** Campos públicos de un job (los que expone la API). Nunca `input_json`,
 * `error_interno_ref`, `worker_id` ni `reserva_id`. */
export interface JobPublico {
  id: string;
  tipo: string;
  recurso_tipo: string | null;
  recurso_id: string | null;
  estado: string;
  prioridad: number;
  progreso: number;
  progreso_detalle: string | null;
  step_actual: string | null;
  intentos: number;
  max_intentos: number;
  provider: string | null;
  modelo: string | null;
  tokens_input: number | null;
  tokens_output: number | null;
  costo_real_usd: number | null;
  result_ref: unknown;
  error_seguro: string | null;
  reused_from: string | null;
  created_at: string;
  authorized_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  expires_at: string;
}

const CAMPOS_PUBLICOS: (keyof JobPublico)[] = [
  "id", "tipo", "recurso_tipo", "recurso_id", "estado", "prioridad", "progreso",
  "progreso_detalle", "step_actual", "intentos", "max_intentos", "provider", "modelo",
  "tokens_input", "tokens_output", "costo_real_usd", "result_ref", "error_seguro",
  "reused_from", "created_at", "authorized_at", "started_at", "finished_at", "expires_at",
];

export function proyectarJobPublico(row: Record<string, unknown>): JobPublico {
  const salida = {} as Record<string, unknown>;
  for (const campo of CAMPOS_PUBLICOS) salida[campo] = row[campo] ?? null;
  return salida as unknown as JobPublico;
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
}

/** Crea (o recupera, si la idempotency_key coincide) un job vía la función
 * SECURITY DEFINER crear_job. Devuelve el job proyectado + si fue nuevo. */
export async function crearJob(
  ctx: ApiContext,
  params: CrearJobParams,
): Promise<{ job: JobPublico; nuevo: boolean }> {
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
  });

  if (error) throw mapearErrorRpcJob(error);
  if (!data) throw ApiError.internal();

  return { job: proyectarJobPublico(data as Record<string, unknown>), nuevo: true };
}
