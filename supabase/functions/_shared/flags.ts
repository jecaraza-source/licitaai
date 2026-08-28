// P2 · G1 — Feature flags para Edge Functions / worker (Deno).
// Gemelo de src/lib/flags.ts — mantener la lógica de evaluarFlag() en sync.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export interface FeatureFlagRow {
  key: string;
  enabled: boolean;
  rollout_pct: number;
  orgs_incluidas: string[];
  orgs_excluidas: string[];
}

/** FNV-1a de 32 bits, idéntico a src/lib/flags.ts. */
export function hashParaRollout(entrada: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < entrada.length; i++) {
    hash ^= entrada.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % 100;
}

export function overrideDeEntorno(key: string): boolean | null {
  const envKey = `FLAG_${key.toUpperCase().replace(/[.-]/g, "_")}`;
  const raw = Deno.env.get(envKey);
  if (raw === undefined) return null;
  const v = raw.trim().toLowerCase();
  if (["on", "1", "true", "yes"].includes(v)) return true;
  if (["off", "0", "false", "no"].includes(v)) return false;
  return null;
}

export function evaluarFlag(
  key: string,
  row: FeatureFlagRow | null | undefined,
  opts: { organizationId?: string } = {},
): boolean {
  const override = overrideDeEntorno(key);
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

let cache: { filas: Map<string, FeatureFlagRow>; expira: number } | null = null;
const TTL_MS = 3_000;

async function cargarFilas(supabase: SupabaseClient): Promise<Map<string, FeatureFlagRow>> {
  if (cache && cache.expira > Date.now()) return cache.filas;
  const { data, error } = await supabase
    .from("feature_flags")
    .select("key, enabled, rollout_pct, orgs_incluidas, orgs_excluidas");
  const filas = new Map<string, FeatureFlagRow>();
  if (!error && data) {
    for (const row of data as FeatureFlagRow[]) filas.set(row.key, row);
  }
  cache = { filas, expira: Date.now() + TTL_MS };
  return filas;
}

/** Nunca lanza: ante cualquier fallo devuelve false. */
export async function isEnabled(
  supabase: SupabaseClient,
  key: string,
  opts: { organizationId?: string } = {},
): Promise<boolean> {
  const override = overrideDeEntorno(key);
  if (override !== null) return override;
  try {
    const filas = await cargarFilas(supabase);
    return evaluarFlag(key, filas.get(key), opts);
  } catch {
    return false;
  }
}
