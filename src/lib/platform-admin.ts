import type { SupabaseClient } from "@supabase/supabase-js";

// Administradores/operadores de la plataforma (equipo LicitaAI) — no un rol
// de organización cliente. Antes era una allowlist de correos por variable
// de entorno (PLATFORM_ADMIN_EMAILS); ahora es la tabla public.platform_admins
// (cuentas reales de Supabase Auth), con dos roles:
//   - ADMIN: acceso completo, puede dar de alta/baja otros admins/operadores.
//   - OPERADOR: solo consulta el panel de operación (p. ej. /admin/salud).

export type RolPlataforma = "ADMIN" | "OPERADOR";

/**
 * Rol de plataforma del usuario autenticado, o null si no es admin ni
 * operador. `supabase` debe ser el cliente de sesión normal (no service
 * role): la policy "platform_admins_select_self" solo deja leer la propia
 * fila, que es exactamente lo que se necesita aquí.
 */
export async function rolPlataforma(
  supabase: SupabaseClient,
  userId: string,
): Promise<RolPlataforma | null> {
  const { data } = await supabase
    .from("platform_admins")
    .select("rol")
    .eq("id", userId)
    .maybeSingle();
  return (data?.rol as RolPlataforma | undefined) ?? null;
}

export async function esPlatformAdmin(supabase: SupabaseClient, userId: string): Promise<boolean> {
  return (await rolPlataforma(supabase, userId)) !== null;
}
