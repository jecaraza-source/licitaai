// P2 · A2 — autorización del worker de jobs. Falla cerrado (mismo criterio
// que estaAutorizadoCron en src/lib/cron-auth.ts).
//
// Acepta cualquiera de:
//   - Bearer <JOB_WORKER_SECRET>          disparador externo dedicado
//   - Bearer <CRON_SECRET>                compat con el secreto de cron ya existente
//   - Bearer <SUPABASE_SERVICE_ROLE_KEY>  pg_cron / pg_net desde Postgres (incremento A3)
//
// Se exige longitud mínima para no aceptar un secreto vacío o trivial.

export function estaAutorizadoWorker(authHeader: string | null): boolean {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return false;
  const token = authHeader.slice("Bearer ".length).trim();
  if (token.length < 16) return false;

  const validos = [
    Deno.env.get("JOB_WORKER_SECRET"),
    Deno.env.get("CRON_SECRET"),
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
  ].filter((v): v is string => typeof v === "string" && v.length >= 16);

  return validos.some((v) => v === token);
}
