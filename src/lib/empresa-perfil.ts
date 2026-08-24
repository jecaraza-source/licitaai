import type { SupabaseClient } from "@supabase/supabase-js";
import type { EmpresaPerfil } from "@/types";

/**
 * Resuelve la empresa "activa": únicamente la que el usuario eligió
 * explícitamente (users.empresa_perfil_id). Si no ha elegido ninguna,
 * devuelve null en vez de asumir una por defecto — quien llama decide
 * qué hacer (p. ej. mandar a /seleccionar-empresa).
 *
 * `fallbackToFirst` existe solo para contextos auxiliares (como exportar
 * documentos con membrete) donde es preferible usar cualquier perfil de
 * la organización antes que no tener ninguno.
 */
export async function getEmpresaPerfilActiva(
  supabase: SupabaseClient,
  organizationId: string,
  userId?: string | null,
  opts?: { fallbackToFirst?: boolean },
): Promise<EmpresaPerfil | null> {
  if (userId) {
    const { data: perfilUsuario } = await supabase
      .from("users")
      .select("empresa_perfil_id")
      .eq("id", userId)
      .maybeSingle();

    if (perfilUsuario?.empresa_perfil_id) {
      const { data: empresa } = await supabase
        .from("empresa_perfil")
        .select("*")
        .eq("id", perfilUsuario.empresa_perfil_id)
        .maybeSingle();
      if (empresa) return empresa as EmpresaPerfil;
    }
  }

  if (!opts?.fallbackToFirst) return null;

  const { data: primera } = await supabase
    .from("empresa_perfil")
    .select("*")
    .eq("organization_id", organizationId)
    .order("updated_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return (primera as EmpresaPerfil) ?? null;
}
