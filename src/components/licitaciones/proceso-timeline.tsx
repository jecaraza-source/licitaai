import { Check, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Licitacion } from "@/types";

const ETAPAS: { key: keyof Licitacion; label: string }[] = [
  { key: "fecha_publicacion", label: "Publicación" },
  { key: "fecha_junta_aclaraciones", label: "Junta de aclaraciones" },
  { key: "fecha_visita", label: "Visita a instalaciones" },
  { key: "fecha_entrega_propuesta", label: "Entrega de propuesta" },
  { key: "fecha_apertura_tecnica", label: "Apertura técnica" },
  { key: "fecha_apertura_economica", label: "Apertura económica" },
  { key: "fecha_fallo", label: "Fallo" },
];

type EstadoEtapa = "completada" | "siguiente" | "programada" | "pendiente";

function formatFechaCorta(fecha: string) {
  return new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", year: "numeric" }).format(
    new Date(fecha),
  );
}

function formatRelativo(fecha: string, now: Date) {
  const diffDias = Math.round((new Date(fecha).getTime() - now.getTime()) / 86_400_000);
  if (diffDias === 0) return "hoy";
  if (diffDias === 1) return "mañana";
  if (diffDias === -1) return "ayer";
  if (diffDias > 0) return `en ${diffDias} días`;
  return `hace ${Math.abs(diffDias)} días`;
}

function calcularEtapas(licitacion: Licitacion, now: Date) {
  let yaHaySiguiente = false;

  return ETAPAS.map((etapa) => {
    const fecha = licitacion[etapa.key] as string | null;
    const completada = !!fecha && new Date(fecha) <= now;

    let estado: EstadoEtapa;
    if (completada) {
      estado = "completada";
    } else if (!yaHaySiguiente) {
      estado = "siguiente";
      yaHaySiguiente = true;
    } else {
      estado = fecha ? "programada" : "pendiente";
    }

    return { ...etapa, fecha, estado };
  });
}

const CIRCLE_STYLES: Record<EstadoEtapa, string> = {
  completada: "border-primary bg-primary text-primary-foreground",
  siguiente: "border-primary bg-background text-primary",
  programada: "border-border bg-background text-muted-foreground",
  pendiente: "border-dashed border-border bg-background text-muted-foreground/50",
};

const LABEL_STYLES: Record<EstadoEtapa, string> = {
  completada: "text-foreground",
  siguiente: "text-foreground",
  programada: "text-muted-foreground",
  pendiente: "text-muted-foreground/60",
};

export function ProcesoTimeline({ licitacion }: { licitacion: Licitacion }) {
  const now = new Date();
  const etapas = calcularEtapas(licitacion, now);

  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex min-w-max gap-0">
        {etapas.map((etapa, i) => (
          <div key={etapa.key} className="flex w-36 flex-col items-center first:w-32 last:w-32">
            <div className="flex w-full items-center">
              <div
                className={cn(
                  "h-0.5 flex-1",
                  i === 0 ? "invisible" : etapas[i - 1].estado === "completada" ? "bg-primary" : "bg-border",
                )}
              />
              <div className="relative flex shrink-0 items-center justify-center">
                {etapa.estado === "siguiente" && (
                  <span className="absolute inline-flex size-8 animate-ping rounded-full bg-primary/30" />
                )}
                <div
                  className={cn(
                    "relative flex size-8 shrink-0 items-center justify-center rounded-full border-2",
                    CIRCLE_STYLES[etapa.estado],
                  )}
                >
                  {etapa.estado === "completada" ? (
                    <Check className="size-4" />
                  ) : (
                    <Circle className="size-2.5 fill-current" />
                  )}
                </div>
              </div>
              <div
                className={cn(
                  "h-0.5 flex-1",
                  i === etapas.length - 1
                    ? "invisible"
                    : etapa.estado === "completada"
                      ? "bg-primary"
                      : "bg-border",
                )}
              />
            </div>
            <div className="mt-2 flex flex-col items-center gap-0.5 px-1 text-center">
              <p className={cn("text-xs font-medium leading-tight", LABEL_STYLES[etapa.estado])}>
                {etapa.label}
              </p>
              {etapa.fecha ? (
                <>
                  <p className="text-xs text-muted-foreground">{formatFechaCorta(etapa.fecha)}</p>
                  <p className="text-[11px] text-muted-foreground/70">{formatRelativo(etapa.fecha, now)}</p>
                </>
              ) : (
                <p className="text-[11px] text-muted-foreground/60">Sin fecha</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
