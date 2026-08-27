// P2 · I — autorización del panel de operación (cross-organización).
//
// Distinto del rol ADMIN de una organización: el dashboard de salud ve
// datos de TODAS las organizaciones, así que se restringe a una allowlist
// de correos del equipo de plataforma (env PLATFORM_ADMIN_EMAILS,
// separados por coma). Sin la env configurada, nadie tiene acceso
// (fail-closed).

export function esPlatformAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const lista = (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return lista.includes(email.toLowerCase());
}
