import { CatalogoLeyes } from "@/components/referencias/catalogo-leyes";
import { PreguntasIaCard } from "@/components/referencias/preguntas-ia-card";

export default function ReferenciasPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Referencias legales</h1>
        <p className="text-muted-foreground">
          Leyes y reglamentos aplicables a licitaciones públicas en México.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <CatalogoLeyes />
        <PreguntasIaCard />
      </div>
    </div>
  );
}
