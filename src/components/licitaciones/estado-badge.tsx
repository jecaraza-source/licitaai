import { cn } from "@/lib/utils";
import type { EstadoLicitacion } from "@/types";

const ESTADO_STYLES: Record<EstadoLicitacion, string> = {
  NUEVA: "bg-muted text-muted-foreground",
  ANALISIS: "bg-accent text-accent-foreground",
  PREPARACION: "bg-secondary text-secondary-foreground",
  ENVIADA: "bg-primary/10 text-primary",
  SEGUIMIENTO: "bg-primary/15 text-primary",
  CERRADA: "bg-muted text-muted-foreground/70",
};

const ESTADO_LABELS: Record<EstadoLicitacion, string> = {
  NUEVA: "Nueva",
  ANALISIS: "Análisis",
  PREPARACION: "Preparación",
  ENVIADA: "Enviada",
  SEGUIMIENTO: "Seguimiento",
  CERRADA: "Cerrada",
};

export function EstadoBadge({ estado }: { estado: EstadoLicitacion }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        ESTADO_STYLES[estado],
      )}
    >
      {ESTADO_LABELS[estado]}
    </span>
  );
}
