// P2 · E1 — reintentos con clasificación de errores y backoff con jitter
// (ADR 0005). Reemplaza la versión que reintentaba CUALQUIER error 3 veces
// con backoff exponencial sincronizado (tormenta de reintentos).

export class ErrorNoReintentable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErrorNoReintentable";
  }
}

/** ¿El error amerita reintento? Errores de credencial/config/validación no
 * se arreglan reintentando; 429 y 5xx / timeouts / red sí. */
export function esReintentable(err: unknown): boolean {
  if (err instanceof ErrorNoReintentable) return false;

  const status =
    (err as { status?: number })?.status ?? (err as { statusCode?: number })?.statusCode;
  if (typeof status === "number") {
    if ([400, 401, 403, 404, 405, 409, 422].includes(status)) return false;
    if (status === 408 || status === 429 || status >= 500) return true;
  }

  const name = (err as Error)?.name ?? "";
  if (["AbortError", "TimeoutError"].includes(name)) return true;

  const msg = ((err as Error)?.message ?? "").toLowerCase();
  if (/api.?key|credential|authentication method|missing credentials|x-api-key|unauthorized|invalid_request/.test(msg)) {
    return false;
  }
  if (/timeout|econnreset|socket hang up|fetch failed|network|overloaded|rate.?limit|529|503|502|500/.test(msg)) {
    return true;
  }
  return true; // por defecto reintentar (el llamante acota el nº de intentos)
}

/** Segundos a esperar si el error trae un header Retry-After (429). */
function retryAfterSegundos(err: unknown): number | null {
  const headers = (err as { headers?: Record<string, string> | Headers })?.headers;
  if (!headers) return null;
  const raw = headers instanceof Headers ? headers.get("retry-after") : headers["retry-after"];
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export interface WithRetryOpts {
  attempts?: number;
  baseDelayMs?: number;
  /** Tope del backoff. */
  maxDelayMs?: number;
  /** Timeout por intento; aborta y (si aplica) reintenta. */
  timeoutMs?: number;
  /** Se llama tras cada fallo reintentable, antes de esperar. */
  onRetry?: (intento: number, err: unknown) => void;
}

export async function withRetry<T>(
  fn: (signal?: AbortSignal) => Promise<T>,
  opts: WithRetryOpts = {},
): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const base = opts.baseDelayMs ?? 1000;
  const max = opts.maxDelayMs ?? 60_000;

  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    let timer: number | undefined;
    const ctrl = opts.timeoutMs ? new AbortController() : undefined;
    if (ctrl && opts.timeoutMs) {
      timer = setTimeout(() => ctrl.abort(new Error("timeout")), opts.timeoutMs) as unknown as number;
    }
    try {
      return await fn(ctrl?.signal);
    } catch (err) {
      lastError = err;
      const ultimo = i === attempts - 1;
      if (ultimo || !esReintentable(err)) throw err;
      opts.onRetry?.(i + 1, err);

      const retryAfter = retryAfterSegundos(err);
      const backoff = retryAfter != null
        ? retryAfter * 1000
        : Math.min(max, base * 2 ** i) * (0.5 + Math.random() * 0.5); // jitter [0.5,1)
      await new Promise((r) => setTimeout(r, backoff));
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  throw lastError;
}
