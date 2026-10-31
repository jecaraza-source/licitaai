import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

// Aviso de que una carga falló, con la salida obvia: reintentar. Sustituye al
// `.catch(() => {})` que dejaba el esqueleto (o una lista vacía que parecía
// real) sin decir que algo había salido mal.
export function ErrorCarga({
  mensaje,
  onReintentar,
}: {
  mensaje: string;
  onReintentar: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm"
    >
      <TriangleAlert className="size-4 shrink-0 text-destructive" aria-hidden="true" />
      <p className="flex-1">{mensaje}</p>
      <Button size="sm" variant="outline" onClick={onReintentar}>
        Reintentar
      </Button>
    </div>
  );
}
