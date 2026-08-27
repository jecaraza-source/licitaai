import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/api";
import { isEnabled } from "@/lib/flags";

// P2 · E2 — lectura del estado del circuit breaker desde las rutas de
// Next.js (ADR 0005). El worker y las Edge Functions REGISTRAN
// éxitos/fallos (service_role); las rutas solo LEEN para degradar
// (no llamar a un proveedor que está caído).

export type ProviderCB = "anthropic" | "openai" | "resend";

/** ¿El circuito de este proveedor está abierto? false si el flag está
 * apagado o ante cualquier error (no bloquear por un fallo del propio
 * check). */
export async function circuitoAbierto(
  supabase: SupabaseClient,
  provider: ProviderCB,
  organizationId?: string,
): Promise<boolean> {
  try {
    if (!(await isEnabled(supabase, "resiliencia.circuit_breaker", { organizationId }))) {
      return false;
    }
    const { data } = await supabase.rpc("cb_estado", { p_provider: provider });
    return data === "OPEN";
  } catch {
    return false;
  }
}

/** Lanza UPSTREAM_ERROR si el circuito del proveedor está abierto — para
 * usar al inicio de una ruta que va a llamar a ese proveedor. */
export async function exigirCircuitoCerrado(
  ctx: { supabase: SupabaseClient; organizationId: string },
  provider: ProviderCB,
): Promise<void> {
  if (await circuitoAbierto(ctx.supabase, provider, ctx.organizationId)) {
    throw ApiError.upstream(
      "El servicio de IA no está disponible temporalmente. Intenta de nuevo en unos minutos.",
    );
  }
}

/** Estado efectivo de todos los circuitos, para /api/estado-ia y la UI. */
export async function estadoCircuitos(
  supabase: SupabaseClient,
): Promise<Record<string, "CLOSED" | "OPEN" | "HALF_OPEN">> {
  const salida: Record<string, "CLOSED" | "OPEN" | "HALF_OPEN"> = {
    anthropic: "CLOSED",
    openai: "CLOSED",
    resend: "CLOSED",
  };
  try {
    const { data } = await supabase.from("provider_health").select("provider, estado, abierto_hasta");
    for (const row of (data ?? []) as Array<{ provider: string; estado: string; abierto_hasta: string | null }>) {
      let estado = row.estado as "CLOSED" | "OPEN" | "HALF_OPEN";
      if (estado === "OPEN" && row.abierto_hasta && new Date(row.abierto_hasta) <= new Date()) {
        estado = "HALF_OPEN";
      }
      salida[row.provider] = estado;
    }
  } catch {
    /* devuelve todo CLOSED */
  }
  return salida;
}
