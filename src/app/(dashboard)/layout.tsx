import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEmpresaPerfilActiva } from "@/lib/empresa-perfil";
import { esPlatformAdmin } from "@/lib/platform-admin";
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
    .select("nombre, email, rol, organization_id, terminos_version")
    .eq("id", user.id)
    .single();

  // Cuentas de admin/operador de plataforma (equipo LicitaAI) no tienen fila
  // en public.users — no pertenecen a ninguna organización cliente. Van a
  // /admin en vez del dashboard de una empresa que no existe.
  if (!perfil && (await esPlatformAdmin(supabase, user.id))) {
    redirect("/admin");
  }

  // P2 · I6 — gate de consentimiento de términos (TERMINOS_GATE=off lo
  // desactiva, p. ej. en los e2e que crean usuarios vía la admin API).
  if (process.env.TERMINOS_GATE !== "off") {
    const { TERMINOS_VERSION } = await import("@/lib/terminos");
    if (perfil && perfil.terminos_version !== TERMINOS_VERSION) {
      redirect("/terminos");
    }
  }

  const nombre = perfil?.nombre ?? user.email ?? "Usuario";
  const email = perfil?.email ?? user.email ?? "";
  const puedeEscribir = perfil?.rol !== "VIEWER";

  const empresaActiva = perfil?.organization_id
    ? await getEmpresaPerfilActiva(supabase, perfil.organization_id, user.id)
    : null;

  if (!empresaActiva && perfil?.organization_id) {
    const { count } = await supabase
      .from("empresa_perfil")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", perfil.organization_id);
    if (count && count > 0) {
      redirect("/seleccionar-empresa");
    }
  }

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
