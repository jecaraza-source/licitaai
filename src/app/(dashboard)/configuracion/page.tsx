import { Suspense } from "react";
import { Settings } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ConfiguracionTabs } from "@/components/configuracion/configuracion-tabs";

export default async function ConfiguracionPage() {
  // El uso de IA y el valor generado los ven ADMIN y MANAGER (la API lo vuelve a comprobar).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: perfil } = user
    ? await supabase.from("users").select("rol").eq("id", user.id).single()
    : { data: null };
  const veAdminManager = perfil?.rol === "ADMIN" || perfil?.rol === "MANAGER";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary">Gestión</p>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <span className="flex size-9 items-center justify-center rounded-lg bg-secondary text-primary">
            <Settings className="size-5" />
          </span>
          Configuración
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Administra el perfil de tu empresa y sus documentos, el staff y, si tienes permiso, el uso de IA y el valor que genera.
        </p>
      </div>

      <Suspense>
        <ConfiguracionTabs veAdminManager={veAdminManager} />
      </Suspense>
    </div>
  );
}
