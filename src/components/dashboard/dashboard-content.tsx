"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Rocket, Clock, FileEdit, Send, TriangleAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EstadoBadge } from "@/components/licitaciones/estado-badge";
import { EstadoBarChart } from "@/components/dashboard/estado-bar-chart";
import { cn } from "@/lib/utils";
import type { DashboardStats, Licitacion } from "@/types";

type KpiKey = "totalActivas" | "proximasAVencer" | "enPreparacion" | "enviadasEsteMes";
type KpiColor = "emerald" | "amber" | "sky" | "violet";

const KPI_LABELS: { key: KpiKey; label: string; icon: typeof Rocket; color: KpiColor }[] = [
  { key: "totalActivas", label: "Licitaciones activas", icon: Rocket, color: "emerald" },
  { key: "proximasAVencer", label: "Próximas a vencer (7 días)", icon: Clock, color: "amber" },
  { key: "enPreparacion", label: "En preparación", icon: FileEdit, color: "sky" },
  { key: "enviadasEsteMes", label: "Enviadas este mes", icon: Send, color: "violet" },
];

// Un color por tarjeta para que se distingan de un vistazo — antes todas
// compartían el mismo primario neutro.
const KPI_ESTILOS: Record<KpiColor, { card: string; icon: string }> = {
  emerald: {
    card: "bg-emerald-500/5",
    icon: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  },
  amber: {
    card: "bg-amber-500/5",
    icon: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  },
  sky: {
    card: "bg-sky-500/5",
    icon: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  },
  violet: {
    card: "bg-violet-500/5",
    icon: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  },
};

function diasRestantes(fecha: string | null): number | null {
  if (!fecha) return null;
  const diff = new Date(fecha).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function formatMonto(monto: number | null) {
  if (monto === null) return null;
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(monto);
}

function Countdown({ fecha }: { fecha: string | null }) {
  const dias = diasRestantes(fecha);
  if (dias === null) return <span className="text-muted-foreground">Sin fecha</span>;
  if (dias < 0) return <span className="text-muted-foreground">Vencida</span>;

  return (
    <span
      className={cn(
        "font-medium",
        dias <= 3 ? "text-destructive" : dias <= 7 ? "text-primary" : "text-muted-foreground",
      )}
    >
      {dias === 0 ? "Vence hoy" : `Vence en ${dias} día${dias === 1 ? "" : "s"}`}
    </span>
  );
}

export function DashboardContent() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recientes, setRecientes] = useState<Licitacion[] | null>(null);
  const [errorStats, setErrorStats] = useState(false);
  const [errorRecientes, setErrorRecientes] = useState(false);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let activo = true;
    const pedir = (url: string) =>
      fetch(url).then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      });

    pedir("/api/dashboard/stats")
      .then((json) => activo && setStats(json.data))
      .catch(() => activo && setErrorStats(true));
    pedir("/api/licitaciones?page=1&pageSize=5")
      .then((json) => activo && setRecientes(json.data?.data ?? []))
      .catch(() => activo && setErrorRecientes(true));

    return () => {
      activo = false;
    };
  }, [intento]);

  function reintentar() {
    setErrorStats(false);
    setErrorRecientes(false);
    setIntento((n) => n + 1);
  }

  const hayError = errorStats || errorRecientes;

  return (
    <div className="flex flex-col gap-6">
      {hayError && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm"
        >
          <TriangleAlert className="size-4 shrink-0 text-destructive" />
          <p className="flex-1">
            No se pudieron cargar algunos datos del resumen. Revisa tu conexión e inténtalo de nuevo.
          </p>
          <Button size="sm" variant="outline" onClick={reintentar}>
            Reintentar
          </Button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {KPI_LABELS.map(({ key, label, icon: Icon, color }) => (
          <Card key={key} size="sm" className={cn("gap-1.5", KPI_ESTILOS[color].card)}>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-0.5">
              <CardTitle className="text-[11px] leading-tight font-medium text-muted-foreground">
                {label}
              </CardTitle>
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full",
                  KPI_ESTILOS[color].icon,
                )}
              >
                <Icon className="size-3" />
              </span>
            </CardHeader>
            <CardContent>
              {stats ? (
                <p className="text-lg font-bold">{stats[key]}</p>
              ) : errorStats ? (
                <p className="text-lg font-bold text-muted-foreground" aria-label="No disponible">
                  —
                </p>
              ) : (
                <Skeleton className="h-6 w-10" />
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Licitaciones por estado</CardTitle>
        </CardHeader>
        <CardContent>
          {stats ? (
            <EstadoBarChart porEstado={stats.porEstado} />
          ) : errorStats ? (
            <p className="text-sm text-muted-foreground">No disponible por ahora.</p>
          ) : (
            <Skeleton className="h-40 w-full" />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Licitaciones recientes</CardTitle>
        </CardHeader>
        <CardContent>
          {recientes === null && errorRecientes ? (
            <p className="text-sm text-muted-foreground">No disponible por ahora.</p>
          ) : recientes === null ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : recientes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aún no hay licitaciones registradas.</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {recientes.map((l) => {
                const descripcion = l.analisis_bases?.[0]?.objeto_contrato;
                const monto = formatMonto(l.monto_maximo);
                return (
                  <li
                    key={l.id}
                    className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/licitaciones/${l.id}`}
                        className="font-medium break-words hover:underline"
                      >
                        {l.numero_expediente} — {l.titulo}
                      </Link>
                      <p className="text-sm break-words text-muted-foreground">{l.institucion}</p>
                      <p className="text-xs break-words text-muted-foreground">
                        {descripcion || "Sin descripción (aún no se analiza con IA)"}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-row flex-wrap items-center gap-2 text-sm sm:flex-col sm:items-end sm:gap-1">
                      <EstadoBadge estado={l.estado_licitacion} />
                      <span className="text-xs font-medium text-muted-foreground">
                        {monto ?? "Monto sin definir"}
                      </span>
                      <Countdown fecha={l.fecha_entrega_propuesta} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
