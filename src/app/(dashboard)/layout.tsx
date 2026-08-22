import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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
    .select("nombre, email")
    .eq("id", user.id)
    .single();

  const nombre = perfil?.nombre ?? user.email ?? "Usuario";
  const email = perfil?.email ?? user.email ?? "";

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <Header nombre={nombre} email={email} />
        <main className="flex flex-1 flex-col gap-4 p-4 md:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
