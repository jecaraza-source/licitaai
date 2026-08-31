import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, PlusCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { LicitacionForm } from "@/components/licitaciones/licitacion-form";

export default async function NuevaLicitacionPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: perfil } = await supabase.from("users").select("rol").eq("id", user.id).single();

  if (perfil?.rol === "VIEWER") {
    redirect("/licitaciones");
  }

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/licitaciones"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Volver a licitaciones
      </Link>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary">Operación</p>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <span className="flex size-9 items-center justify-center rounded-lg bg-secondary text-primary">
            <PlusCircle className="size-5" />
          </span>
          Nueva licitación
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Registra una oportunidad para dar seguimiento a su proceso y documentación.
        </p>
      </div>

      <LicitacionForm />
    </div>
  );
}
