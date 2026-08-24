import Link from "next/link";
import { FileStack } from "lucide-react";
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <FileStack className="size-5 text-primary" />
            Licitaciones
          </h1>
          <p className="text-muted-foreground">Todas las licitaciones de tu organización.</p>
        </div>
        {puedeEscribir && (
          <Button
            nativeButton={false}
            render={<Link href="/licitaciones/nueva">Nueva licitación</Link>}
          />
        )}
      </div>
      <LicitacionesTable />
    </div>
  );
}
