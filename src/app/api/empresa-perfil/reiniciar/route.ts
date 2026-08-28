import { apiRoute, ApiError } from "@/lib/api";

/**
 * Limpia la empresa activa del usuario al iniciar sesión, para que
 * (dashboard)/layout.tsx lo mande a /seleccionar-empresa en vez de
 * reanudar silenciosamente la última empresa elegida.
 */
export const POST = apiRoute({}, async ({ ctx }) => {
  const { error } = await ctx.supabase
    .from("users")
    .update({ empresa_perfil_id: null })
    .eq("id", ctx.userId);

  if (error) throw ApiError.internal();
  return { data: { ok: true } };
});
