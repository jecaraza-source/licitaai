import { Scale } from "lucide-react";
import { CatalogoLeyes } from "@/components/referencias/catalogo-leyes";
import { PreguntasIaCard } from "@/components/referencias/preguntas-ia-card";

export default function ReferenciasPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary">Gestión</p>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <span className="flex size-9 items-center justify-center rounded-lg bg-secondary text-primary">
            <Scale className="size-5" />
          </span>
          Referencias legales
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Leyes y reglamentos aplicables a licitaciones públicas en México.
        </p>
      </div>
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <CatalogoLeyes />
        <PreguntasIaCard />
      </div>
    </div>
  );
}
