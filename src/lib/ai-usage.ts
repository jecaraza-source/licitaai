import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Tope diario de tokens (input+output) por organización, aplicado vía la
 * función de Postgres `check_ai_budget` (SECURITY DEFINER, deriva
 * organization_id de auth.uid() — nunca de un valor enviado por el
 * cliente). Ver supabase/migrations/20260826230000_p0_ai_usage_budget.sql.
 */
export async function checkAiBudget(
  supabase: SupabaseClient,
  limite = 3_000_000,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("check_ai_budget", { p_limite_diario: limite });
  if (error) return true; // no bloquear si el check mismo falla (mismo criterio que checkRateLimit)
  return data === true;
}

export function aiBudgetResponse() {
  return Response.json(
    { error: "Se alcanzó el límite diario de uso de IA para tu organización. Intenta de nuevo mañana." },
    { status: 429 },
  );
}

/** Registra tokens consumidos por una llamada a IA. No lanza: un fallo al
 * registrar el uso no debe tumbar una respuesta ya generada. */
export async function logAiUsage(
  supabase: SupabaseClient,
  params: { funcion: string; modelo: string; inputTokens: number; outputTokens: number },
): Promise<void> {
  const { error } = await supabase.rpc("registrar_uso_ia", {
    p_funcion: params.funcion,
    p_modelo: params.modelo,
    p_input_tokens: Math.max(0, Math.round(params.inputTokens) || 0),
    p_output_tokens: Math.max(0, Math.round(params.outputTokens) || 0),
  });
  if (error) {
    console.error(`No se pudo registrar uso de IA (${params.funcion}):`, error.message);
  }
}
