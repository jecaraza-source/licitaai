/**
 * Autoriza una solicitud a un endpoint de cron (Vercel Cron) comparando el
 * header Authorization contra CRON_SECRET. Falla cerrado si CRON_SECRET no
 * está configurado: sin ese chequeo, un despliegue con la env var faltante
 * compararía contra el literal "Bearer undefined" — adivinable por
 * cualquiera — en vez de rechazar toda solicitud.
 */
export function estaAutorizadoCron(authHeader: string | null, cronSecret: string | undefined): boolean {
  if (!cronSecret) return false;
  return authHeader === `Bearer ${cronSecret}`;
}
