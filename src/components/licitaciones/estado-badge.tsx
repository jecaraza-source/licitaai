import { cn } from "@/lib/utils";
import type { EstadoLicitacion } from "@/types";

// Un matiz propio por etapa (más el punto de color) para escanear una lista
// de un vistazo; "Enviada" toma la marca de la empresa.
const ESTADO_STYLES: Record<EstadoLicitacion, { chip: string; dot: string }> = {
  NUEVA: { chip: "border-slate-300/70 bg-slate-100 text-slate-700", dot: "bg-slate-400" },
  ANALISIS: { chip: "border-sky-200 bg-sky-50 text-sky-800", dot: "bg-sky-500" },
  PREPARACION: { chip: "border-amber-200 bg-amber-50 text-amber-900", dot: "bg-amber-500" },
  ENVIADA: { chip: "border-primary/20 bg-primary/10 text-primary", dot: "bg-primary" },
  SEGUIMIENTO: { chip: "border-violet-200 bg-violet-50 text-violet-800", dot: "bg-violet-500" },
  CERRADA: { chip: "border-border bg-muted text-muted-foreground", dot: "bg-muted-foreground/50" },
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
  const { chip, dot } = ESTADO_STYLES[estado];
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold whitespace-nowrap",
        chip,
      )}
    >
      <span className={cn("size-1.5 rounded-full", dot)} aria-hidden="true" />
      {ESTADO_LABELS[estado]}
    </span>
  );
}
