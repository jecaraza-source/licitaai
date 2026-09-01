import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { rolPlataforma } from "@/lib/platform-admin";

// Gate del panel de plataforma (equipo LicitaAI, no organizaciones
// cliente): antes solo /api/admin/salud comprobaba PLATFORM_ADMIN_EMAILS y
// la página cargaba para cualquier sesión (mostrando "No autorizado" si la
// API rechazaba). Ahora el gate está aquí, a nivel de layout, así que
// ninguna página bajo /admin renderiza su contenido sin ser admin/operador
// de plataforma.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const rol = await rolPlataforma(supabase, user.id);
  if (!rol) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-svh flex-col">
      <nav className="flex items-center gap-4 border-b px-6 py-3 text-sm font-medium">
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
          Plataforma
        </span>
        <Link href="/admin/salud" className="text-foreground/70 hover:text-foreground">
          Salud
        </Link>
        <Link href="/admin/usuarios" className="text-foreground/70 hover:text-foreground">
          Usuarios
        </Link>
      </nav>
      {children}
    </div>
  );
}
