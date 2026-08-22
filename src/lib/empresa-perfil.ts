import type { SupabaseClient } from "@supabase/supabase-js";
import type { EmpresaPerfil } from "@/types";

/**
 * Resuelve la empresa "activa": la que el usuario eligió (users.empresa_perfil_id)
 * o, si no ha elegido ninguna, la más antigua registrada en la organización.
 */
export async function getEmpresaPerfilActiva(
  supabase: SupabaseClient,
  organizationId: string,
  userId?: string | null,
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

  const { data: primera } = await supabase
    .from("empresa_perfil")
    .select("*")
    .eq("organization_id", organizationId)
    .order("updated_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return (primera as EmpresaPerfil) ?? null;
}
