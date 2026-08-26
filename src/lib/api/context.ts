import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { ApiError } from "./errors";

export const ROLES = ["ADMIN", "MANAGER", "ANALYST", "VIEWER"] as const;
export type Rol = (typeof ROLES)[number];

/**
 * Contexto de una request ya autenticada: el usuario, su organización y rol
 * (resueltos server-side desde la tabla `users`, nunca de un valor que
 * mande el cliente), y el cliente Supabase con RLS activo para el resto de
 * la ruta. Mismo espíritu que AuthContext en
 * supabase/functions/_shared/auth.ts para las Edge Functions — aquí es el
 * equivalente para rutas de Next.js.
 */
export interface ApiContext {
  requestId: string;
  userId: string;
  email: string;
  organizationId: string;
  rol: Rol;
  supabase: SupabaseClient;
}

/**
 * Resuelve la sesión del llamante y su perfil (organization_id, rol) desde
 * Postgres. Lanza ApiError.unauthenticated() si no hay sesión válida, o
 * ApiError.forbidden() si el usuario no tiene una fila en `users` (cuenta a
 * medio crear / desincronizada).
 */
export async function requireApiContext(requestId: string): Promise<ApiContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw ApiError.unauthenticated();
  }

  const { data: perfil } = await supabase
    .from("users")
    .select("organization_id, rol")
    .eq("id", user.id)
    .maybeSingle();

  if (!perfil) {
    throw ApiError.forbidden("Perfil no encontrado");
  }

  return {
    requestId,
    userId: user.id,
    email: user.email ?? "",
    organizationId: perfil.organization_id,
    rol: perfil.rol as Rol,
    supabase,
  };
}

/** Lanza ApiError.forbidden() si ctx.rol no está en la lista permitida. */
export function requireRole(ctx: ApiContext, permitidos: readonly Rol[]): void {
  if (!permitidos.includes(ctx.rol)) {
    throw ApiError.forbidden(`Tu rol (${ctx.rol}) no permite realizar esta acción`);
  }
}

/** Atajo común: cualquier rol excepto VIEWER (mismo criterio que
 * requiereEscritura en el auth.ts de las Edge Functions). */
export function requireWriteRole(ctx: ApiContext): void {
  requireRole(ctx, ["ADMIN", "MANAGER", "ANALYST"]);
}
