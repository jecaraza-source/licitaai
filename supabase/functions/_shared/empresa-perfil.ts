// LicitaAI: resuelve la empresa "activa" de una organización.
//
// Las Edge Functions corren con el service role (sin auth.uid()), así que no
// hay un "usuario actual" implícito. Se usa el creador de la licitación
// (licitacion.created_by) como el usuario cuya empresa activa aplica; si no
// tiene una elegida, se cae a la empresa más antigua de la organización.

// deno-lint-ignore no-explicit-any
export async function getEmpresaPerfilActiva(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  organizationId: string,
  actorUserId?: string | null,
) {
  if (actorUserId) {
    const { data: perfilUsuario } = await supabase
      .from("users")
      .select("empresa_perfil_id")
      .eq("id", actorUserId)
      .maybeSingle();

    if (perfilUsuario?.empresa_perfil_id) {
      const { data: empresa } = await supabase
        .from("empresa_perfil")
        .select("*")
        .eq("id", perfilUsuario.empresa_perfil_id)
        .maybeSingle();
      if (empresa) return empresa;
    }
  }

  const { data: primera } = await supabase
    .from("empresa_perfil")
    .select("*")
    .eq("organization_id", organizationId)
    .order("updated_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return primera ?? null;
}
