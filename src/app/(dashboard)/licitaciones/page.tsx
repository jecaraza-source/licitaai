import Link from "next/link";
import { FileStack, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { LicitacionesTable } from "@/components/licitaciones/licitaciones-table";

export default async function LicitacionesPage() {
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
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary">Operación</p>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <span className="flex size-9 items-center justify-center rounded-lg bg-secondary text-primary">
              <FileStack className="size-5" />
            </span>
            Licitaciones
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Todas las licitaciones de tu organización.
          </p>
        </div>
        {puedeEscribir && (
          <Button
            nativeButton={false}
            className="h-11 gap-2"
            render={
              <Link href="/licitaciones/nueva">
                <Plus className="size-4" />
                Nueva licitación
              </Link>
            }
          />
        )}
      </div>
      <LicitacionesTable />
    </div>
  );
}
