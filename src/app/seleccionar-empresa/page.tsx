import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEmpresaPerfilActiva } from "@/lib/empresa-perfil";
import { SeleccionarEmpresaScreen } from "@/components/seleccionar-empresa/seleccionar-empresa-screen";
import type { EmpresaPerfil } from "@/types";

export default async function SeleccionarEmpresaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: perfil } = await supabase
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  if (!perfil?.organization_id) {
    redirect("/dashboard");
  }

  const empresaActiva = await getEmpresaPerfilActiva(supabase, perfil.organization_id, user.id);
  if (empresaActiva) {
    redirect("/dashboard");
  }

  const { data: empresas } = await supabase
    .from("empresa_perfil")
    .select("*")
    .eq("organization_id", perfil.organization_id)
    .order("razon_social", { ascending: true });

  if (!empresas || empresas.length === 0) {
    redirect("/dashboard");
  }

  return <SeleccionarEmpresaScreen empresas={empresas as EmpresaPerfil[]} />;
}
