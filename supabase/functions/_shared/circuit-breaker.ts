// P2 · E2 — circuit breaker por proveedor externo (ADR 0005).
// Estado compartido en public.provider_health (ver migración
// 20260829000000). Detrás del flag `resiliencia.circuit_breaker`.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { isEnabled } from "./flags.ts";

const UMBRAL = Number(Deno.env.get("CB_UMBRAL_FALLOS") ?? "5");
const ABIERTO_SEG = Number(Deno.env.get("CB_ABIERTO_SEGUNDOS") ?? "60");

export class CircuitoAbiertoError extends Error {
  constructor(public readonly provider: string) {
    super(`El proveedor ${provider} no está disponible temporalmente (circuit breaker abierto)`);
    this.name = "CircuitoAbiertoError";
  }
}

/** ¿El circuito de este proveedor permite pasar ahora? (siempre true si el
 * flag está apagado). */
export async function circuitoPermite(
  service: SupabaseClient,
  provider: string,
  organizationId?: string,
): Promise<boolean> {
  const on = await isEnabled(service, "resiliencia.circuit_breaker", { organizationId });
  if (!on) return true;
  const { data } = await service.rpc("cb_estado", { p_provider: provider });
  return data !== "OPEN";
}

export async function registrarExito(service: SupabaseClient, provider: string): Promise<void> {
  try {
    await service.rpc("cb_registrar_exito", { p_provider: provider });
  } catch { /* best-effort */ }
}

export async function registrarFallo(service: SupabaseClient, provider: string): Promise<void> {
  try {
    await service.rpc("cb_registrar_fallo", {
      p_provider: provider,
      p_umbral: UMBRAL,
      p_abierto_segundos: ABIERTO_SEG,
    });
  } catch { /* best-effort */ }
}

/**
 * Envuelve una llamada a un proveedor: chequea el circuito antes, y
 * registra éxito/fallo después. Un fallo que "cuenta" para el breaker es
 * uno que parece indisponibilidad del proveedor (5xx/429/timeout/red) — no
 * un 4xx de nuestra parte.
 */
export async function conBreaker<T>(
  service: SupabaseClient,
  provider: string,
  fn: () => Promise<T>,
  opts: { organizationId?: string; cuentaFallo?: (err: unknown) => boolean } = {},
): Promise<T> {
  if (!(await circuitoPermite(service, provider, opts.organizationId))) {
    throw new CircuitoAbiertoError(provider);
  }
  const cuenta = opts.cuentaFallo ?? esFalloDeProveedor;
  try {
    const r = await fn();
    await registrarExito(service, provider);
    return r;
  } catch (err) {
    if (cuenta(err)) await registrarFallo(service, provider);
    throw err;
  }
}

export function esFalloDeProveedor(err: unknown): boolean {
  const status =
    (err as { status?: number })?.status ?? (err as { statusCode?: number })?.statusCode;
  if (typeof status === "number") return status === 408 || status === 429 || status >= 500;
  const name = (err as Error)?.name ?? "";
  if (["AbortError", "TimeoutError", "CircuitoAbiertoError"].includes(name)) return name !== "CircuitoAbiertoError";
  const msg = ((err as Error)?.message ?? "").toLowerCase();
  return /timeout|econnreset|socket hang up|fetch failed|network|overloaded|529|503|502|500|rate.?limit/.test(msg);
}
