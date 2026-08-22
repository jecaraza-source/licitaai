import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Límite de solicitudes a endpoints de IA: máx `max` por usuario por minuto,
 * aplicado vía la función de Postgres `check_rate_limit` (ventana deslizante).
 */
export async function checkRateLimit(
  supabase: SupabaseClient,
  ruta: string,
  max = 10,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("check_rate_limit", {
    p_ruta: ruta,
    p_max_por_minuto: max,
  });
  if (error) return true; // no bloquear si el rate limiter mismo falla
  return data === true;
}

export function rateLimitResponse() {
  return Response.json(
    { error: "Demasiadas solicitudes. Intenta de nuevo en un minuto." },
    { status: 429 },
  );
}
