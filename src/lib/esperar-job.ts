import type { Job } from "../types";

// Soporte de UI para operaciones de IA que, con un flag `jobs.async_*`
// activo, responden `202 { data: { job_id, estado, async: true } }` en vez
// del resultado. Lógica pura (sin React) para poder probarla: el hook
// `useEsperarJob` la envuelve con ciclo de vida de componente.
//
// Consulta GET /api/jobs/:id (no está detrás de ningún flag) y se detiene al
// llegar a un estado terminal. Cuando el job completa, el resultado ya está
// guardado en las tablas de dominio (la Edge Function lo escribe), así que
// quien llama solo tiene que volver a cargar su dato.

export interface RespuestaAsincrona {
  job_id: string;
  estado: string;
  async: true;
}

/** ¿Es esta respuesta JSON de una ruta un "trabajo encolado"? Devuelve los
 * datos del job o null si es una respuesta síncrona normal. */
export function respuestaAsincrona(json: unknown): RespuestaAsincrona | null {
  const data = (json as { data?: unknown } | null | undefined)?.data as
    | { job_id?: unknown; async?: unknown; estado?: unknown }
    | null
    | undefined;
  if (!data || data.async !== true || typeof data.job_id !== "string" || !data.job_id) return null;
  return { job_id: data.job_id, estado: typeof data.estado === "string" ? data.estado : "PENDING", async: true };
}

export interface RespuestaLoteAsincrona {
  jobs: string[];
  expediente_job_id: string | null;
}

/** Variante de `respuestaAsincrona` para `auditar-todos`, que encola un job
 * por documento más uno de expediente: `{ data: { jobs: [...], expediente_job_id, async: true } }`. */
export function respuestaLoteAsincrona(json: unknown): RespuestaLoteAsincrona | null {
  const data = (json as { data?: unknown } | null | undefined)?.data as
    | { jobs?: unknown; expediente_job_id?: unknown; async?: unknown }
    | null
    | undefined;
  if (!data || data.async !== true || !Array.isArray(data.jobs)) return null;
  const jobs = data.jobs.filter((j): j is string => typeof j === "string" && j.length > 0);
  const exp = typeof data.expediente_job_id === "string" && data.expediente_job_id ? data.expediente_job_id : null;
  return { jobs, expediente_job_id: exp };
}

const TERMINALES = ["COMPLETED", "FAILED", "CANCELLED", "EXPIRED"] as const;

export function jobTerminal(estado: string | null | undefined): boolean {
  return !!estado && (TERMINALES as readonly string[]).includes(estado);
}

export type ResultadoJob =
  | { estado: "completado"; job: Job }
  | { estado: "fallido"; job: Job }
  | { estado: "cancelado"; job: Job }
  /** Se agotó la espera: el job puede seguir corriendo en el servidor. */
  | { estado: "tiempo_agotado" }
  /** La pantalla se desmontó o se canceló la espera. */
  | { estado: "abortado" };

export interface OpcionesEspera {
  /** Consulta el job. Debe lanzar ante un error de red / HTTP. */
  fetchJob?: (jobId: string, signal?: AbortSignal) => Promise<Job>;
  /** Espera `ms` (inyectable para tests). Debe resolver al abortar. */
  dormir?: (ms: number, signal?: AbortSignal) => Promise<void>;
  signal?: AbortSignal;
  /** Se llama con cada lectura del job (progreso en vivo). */
  onJob?: (job: Job) => void;
  intervaloInicialMs?: number;
  intervaloMaxMs?: number;
  /** Tope total de espera. Por defecto 15 min. */
  esperaMaximaMs?: number;
  /** Errores de consulta consecutivos tolerados antes de rendirse. */
  erroresMaximos?: number;
  /** Reloj inyectable (tests). */
  ahora?: () => number;
}

const INTERVALO_INICIAL_MS = 3_000;
const INTERVALO_MAX_MS = 8_000;
const ESPERA_MAXIMA_MS = 15 * 60_000;
const ERRORES_MAXIMOS = 5;

export async function fetchJobPorApi(jobId: string, signal?: AbortSignal): Promise<Job> {
  const res = await fetch(`/api/jobs/${jobId}`, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as { data?: Job };
  if (!body.data) throw new Error("respuesta sin datos");
  return body.data;
}

export function dormirConAbort(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const t = setTimeout(done, ms);
    function done() {
      clearTimeout(t);
      signal?.removeEventListener("abort", done);
      resolve();
    }
    signal?.addEventListener("abort", done, { once: true });
  });
}

/** Espera a que un job llegue a un estado terminal. Nunca lanza por errores
 * transitorios de red: reintenta, y tras `erroresMaximos` seguidos devuelve
 * `tiempo_agotado` (el job sigue en el servidor; la pantalla debe decirlo). */
export async function esperarJob(jobId: string, opts: OpcionesEspera = {}): Promise<ResultadoJob> {
  const fetchJob = opts.fetchJob ?? fetchJobPorApi;
  const dormir = opts.dormir ?? dormirConAbort;
  const ahora = opts.ahora ?? Date.now;
  const maxEspera = opts.esperaMaximaMs ?? ESPERA_MAXIMA_MS;
  const maxErrores = opts.erroresMaximos ?? ERRORES_MAXIMOS;
  const inicio = ahora();
  let intervalo = opts.intervaloInicialMs ?? INTERVALO_INICIAL_MS;
  const intervaloMax = opts.intervaloMaxMs ?? INTERVALO_MAX_MS;
  let errores = 0;

  for (;;) {
    if (opts.signal?.aborted) return { estado: "abortado" };

    try {
      const job = await fetchJob(jobId, opts.signal);
      errores = 0;
      if (opts.signal?.aborted) return { estado: "abortado" };
      opts.onJob?.(job);
      if (job.estado === "COMPLETED") return { estado: "completado", job };
      if (job.estado === "CANCELLED") return { estado: "cancelado", job };
      if (job.estado === "FAILED" || job.estado === "EXPIRED") return { estado: "fallido", job };
    } catch {
      if (opts.signal?.aborted) return { estado: "abortado" };
      errores++;
      if (errores >= maxErrores) return { estado: "tiempo_agotado" };
    }

    if (ahora() - inicio >= maxEspera) return { estado: "tiempo_agotado" };
    await dormir(intervalo, opts.signal);
    intervalo = Math.min(Math.round(intervalo * 1.5), intervaloMax);
  }
}

// --- Lotes (auditar todos los documentos) -----------------------------------

export interface EstadoJobLote {
  id: string;
  estado: string;
}

export interface ProgresoLote {
  total: number;
  terminados: number;
  completados: number;
  fallidos: number;
}

export type ResultadoLote =
  | ({ estado: "terminado" } & ProgresoLote)
  | { estado: "tiempo_agotado"; progreso: ProgresoLote }
  | { estado: "abortado" };

export interface OpcionesLote {
  /** Lee el estado de todos los ids en UNA consulta. Debe lanzar ante error. */
  fetchEstados: (ids: string[]) => Promise<EstadoJobLote[]>;
  dormir?: (ms: number, signal?: AbortSignal) => Promise<void>;
  signal?: AbortSignal;
  onProgreso?: (p: ProgresoLote) => void;
  intervaloMs?: number;
  esperaMaximaMs?: number;
  erroresMaximos?: number;
  ahora?: () => number;
}

export function resumirLote(ids: string[], filas: EstadoJobLote[]): ProgresoLote {
  const porId = new Map(filas.map((f) => [f.id, f.estado]));
  let terminados = 0;
  let completados = 0;
  let fallidos = 0;
  for (const id of ids) {
    const estado = porId.get(id);
    if (!jobTerminal(estado)) continue;
    terminados++;
    if (estado === "COMPLETED") completados++;
    else fallidos++;
  }
  return { total: ids.length, terminados, completados, fallidos };
}

/** Espera a que todos los jobs de un lote terminen, con una sola consulta por
 * ronda (no una por job). */
export async function esperarLote(ids: string[], opts: OpcionesLote): Promise<ResultadoLote> {
  const dormir = opts.dormir ?? dormirConAbort;
  const ahora = opts.ahora ?? Date.now;
  const intervalo = opts.intervaloMs ?? 4_000;
  const maxEspera = opts.esperaMaximaMs ?? ESPERA_MAXIMA_MS;
  const maxErrores = opts.erroresMaximos ?? ERRORES_MAXIMOS;
  const inicio = ahora();
  let errores = 0;
  let ultimo: ProgresoLote = { total: ids.length, terminados: 0, completados: 0, fallidos: 0 };

  if (ids.length === 0) return { estado: "terminado", ...ultimo };

  for (;;) {
    if (opts.signal?.aborted) return { estado: "abortado" };
    try {
      const filas = await opts.fetchEstados(ids);
      errores = 0;
      if (opts.signal?.aborted) return { estado: "abortado" };
      ultimo = resumirLote(ids, filas);
      opts.onProgreso?.(ultimo);
      if (ultimo.terminados >= ultimo.total) return { estado: "terminado", ...ultimo };
    } catch {
      if (opts.signal?.aborted) return { estado: "abortado" };
      errores++;
      if (errores >= maxErrores) return { estado: "tiempo_agotado", progreso: ultimo };
    }
    if (ahora() - inicio >= maxEspera) return { estado: "tiempo_agotado", progreso: ultimo };
    await dormir(intervalo, opts.signal);
  }
}

// --- Mensajes -----------------------------------------------------------------

/** Texto para el usuario cuando la espera NO terminó en "completado".
 * Devuelve null si completó o si la pantalla se desmontó (no hay nada que
 * decir). Usa `error_seguro` (ya sanitizado por el worker), nunca el interno. */
export function descripcionFalloJob(r: ResultadoJob): string | null {
  switch (r.estado) {
    case "completado":
    case "abortado":
      return null;
    case "fallido":
      return r.job.error_seguro || "El procesamiento falló. Inténtalo de nuevo en unos minutos.";
    case "cancelado":
      return "La operación se canceló.";
    case "tiempo_agotado":
      return "Sigue en proceso en el servidor. Vuelve a abrir esta pestaña en unos minutos para ver el resultado.";
  }
}
