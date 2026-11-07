import { Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { BandejaCorreosContent } from "@/components/correos/bandeja-correos";

export default async function CorreosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: perfil } = user
    ? await supabase.from("users").select("rol").eq("id", user.id).single()
    : { data: null };
  const puedeEscribir = perfil?.rol !== "VIEWER";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary">Operación</p>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <span className="flex size-9 items-center justify-center rounded-lg bg-secondary text-primary">
            <Mail className="size-5" />
          </span>
          Correos de Compras MX
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Los avisos que Compras MX envía a tu empresa. Asocia cada uno a su licitación para que quede en el
          historial.
        </p>
      </div>
      <BandejaCorreosContent puedeEscribir={puedeEscribir} />
    </div>
  );
}
