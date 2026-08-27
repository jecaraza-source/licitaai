import type { SupabaseClient } from "@supabase/supabase-js";

// P2 · G1 — Feature flags (ADR 0008). Evaluación server-side, respaldada
// por la tabla public.feature_flags + override por variable de entorno.
// El gemelo para Deno (Edge Functions / worker) es
// supabase/functions/_shared/flags.ts — mantener ambos en sync.

export interface FeatureFlagRow {
  key: string;
  enabled: boolean;
  rollout_pct: number;
  orgs_incluidas: string[];
  orgs_excluidas: string[];
}

/** Hash determinista (FNV-1a de 32 bits) para el bucketing de rollout. No
 * es criptográfico a propósito: solo necesita ser estable y bien
 * distribuido para que subir `rollout_pct` nunca saque a una org que ya
 * estaba dentro. Idéntico en el módulo de Deno. */
export function hashParaRollout(entrada: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < entrada.length; i++) {
    hash ^= entrada.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % 100;
}

/** Lee el override de entorno para una key. `FLAG_<KEY>` con la key en
 * mayúsculas y los `.`/`-` como `_`. Devuelve true/false si está definido
 * como on/off/1/0/true/false, o null si no hay override. */
export function overrideDeEntorno(
  key: string,
  env: Record<string, string | undefined> = typeof process !== "undefined" ? process.env : {},
): boolean | null {
  const envKey = `FLAG_${key.toUpperCase().replace(/[.-]/g, "_")}`;
  const raw = env[envKey];
  if (raw === undefined) return null;
  const v = raw.trim().toLowerCase();
  if (["on", "1", "true", "yes"].includes(v)) return true;
  if (["off", "0", "false", "no"].includes(v)) return false;
  return null;
}

/**
 * Lógica pura de resolución de un flag. Testeable sin Supabase.
 *   1. override de entorno gana sobre todo
 *   2. orgs_excluidas -> false
 *   3. orgs_incluidas -> true
 *   4. rollout_pct    -> hash(key + org) % 100 < rollout_pct
 *   5. default        -> row.enabled
 * Si no hay fila (flag desconocido), devuelve false.
 */
export function evaluarFlag(
  key: string,
  row: FeatureFlagRow | null | undefined,
  opts: { organizationId?: string; env?: Record<string, string | undefined> } = {},
): boolean {
  const override = overrideDeEntorno(key, opts.env);
  if (override !== null) return override;

  if (!row) return false;

  const org = opts.organizationId;
  if (org) {
    if (row.orgs_excluidas?.includes(org)) return false;
    if (row.orgs_incluidas?.includes(org)) return true;
  }

  if (row.rollout_pct > 0 && org) {
    return hashParaRollout(`${key}:${org}`) < row.rollout_pct;
  }

  return row.enabled;
}

// --- Caché en memoria del proceso (30 s) para no consultar por request ---
interface CacheEntry {
  filas: Map<string, FeatureFlagRow>;
  expira: number;
}
let cache: CacheEntry | null = null;
const TTL_MS = 30_000;

/** Solo para tests: limpia la caché de flags. */
export function _resetFlagsCache(): void {
  cache = null;
}

async function cargarFilas(supabase: SupabaseClient): Promise<Map<string, FeatureFlagRow>> {
  if (cache && cache.expira > Date.now()) return cache.filas;
  const { data, error } = await supabase
    .from("feature_flags")
    .select("key, enabled, rollout_pct, orgs_incluidas, orgs_excluidas");
  const filas = new Map<string, FeatureFlagRow>();
  if (!error && data) {
    for (const row of data as FeatureFlagRow[]) filas.set(row.key, row);
  }
  // Cachea incluso ante error (mapa vacío) para no martillar la DB; el TTL
  // corto hace que se reintente pronto. Un flag no resuelto = apagado.
  cache = { filas, expira: Date.now() + TTL_MS };
  return filas;
}

/**
 * ¿Está activo `key` para esta organización? Nunca lanza: ante cualquier
 * fallo (DB caída, flag inexistente) devuelve false — un flag es
 * opt-in, y "no lo sé" se trata como "apagado".
 */
export async function isEnabled(
  supabase: SupabaseClient,
  key: string,
  opts: { organizationId?: string } = {},
): Promise<boolean> {
  // El override de entorno no necesita tocar la DB.
  const override = overrideDeEntorno(key);
  if (override !== null) return override;
  try {
    const filas = await cargarFilas(supabase);
    return evaluarFlag(key, filas.get(key), opts);
  } catch {
    return false;
  }
}

/** Resuelve varios flags de una vez (una sola carga). */
export async function resolveFlags(
  supabase: SupabaseClient,
  keys: string[],
  opts: { organizationId?: string } = {},
): Promise<Record<string, boolean>> {
  let filas: Map<string, FeatureFlagRow>;
  try {
    filas = await cargarFilas(supabase);
  } catch {
    filas = new Map();
  }
  const salida: Record<string, boolean> = {};
  for (const key of keys) {
    salida[key] = evaluarFlag(key, filas.get(key), opts);
  }
  return salida;
}
