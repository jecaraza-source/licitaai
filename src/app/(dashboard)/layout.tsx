import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEmpresaPerfilActiva } from "@/lib/empresa-perfil";
import { buildCompanyThemeStyle } from "@/lib/theme-colors";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Header } from "@/components/layout/header";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: perfil } = await supabase
    .from("users")
    .select("nombre, email, rol, organization_id")
    .eq("id", user.id)
    .single();

  const nombre = perfil?.nombre ?? user.email ?? "Usuario";
  const email = perfil?.email ?? user.email ?? "";
  const puedeEscribir = perfil?.rol !== "VIEWER";

  const empresaActiva = perfil?.organization_id
    ? await getEmpresaPerfilActiva(supabase, perfil.organization_id, user.id)
    : null;

  const themeStyle = buildCompanyThemeStyle(
    empresaActiva?.color_primario,
    empresaActiva?.color_secundario,
  );

  return (
    <SidebarProvider>
      {themeStyle && <style dangerouslySetInnerHTML={{ __html: themeStyle }} />}
      <AppSidebar
        puedeEscribir={puedeEscribir}
        logoUrl={empresaActiva?.logo_url ?? null}
        empresaNombre={empresaActiva?.razon_social ?? null}
      />
      <SidebarInset>
        <Header nombre={nombre} email={email} empresaNombre={empresaActiva?.razon_social ?? null} />
        <main className="flex flex-1 flex-col gap-4 p-4 md:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
