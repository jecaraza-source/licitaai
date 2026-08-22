import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEmpresaPerfilActiva } from "@/lib/empresa-perfil";
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

  return (
    <SidebarProvider>
      <AppSidebar puedeEscribir={puedeEscribir} />
      <SidebarInset>
        <Header nombre={nombre} email={email} empresaNombre={empresaActiva?.razon_social ?? null} />
        <main className="flex flex-1 flex-col gap-4 p-4 md:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
