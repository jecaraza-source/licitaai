"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EstadoBadge } from "@/components/licitaciones/estado-badge";
import { cn } from "@/lib/utils";
import type { DashboardStats, Licitacion } from "@/types";

const KPI_LABELS: { key: keyof DashboardStats; label: string }[] = [
  { key: "totalActivas", label: "Licitaciones activas" },
  { key: "proximasAVencer", label: "Próximas a vencer (7 días)" },
  { key: "enPreparacion", label: "En preparación" },
  { key: "enviadasEsteMes", label: "Enviadas este mes" },
];

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

  useEffect(() => {
    fetch("/api/dashboard/stats")
      .then((res) => res.json())
      .then((json) => setStats(json.data))
      .catch(() => {});
    fetch("/api/licitaciones?page=1&pageSize=5")
      .then((res) => res.json())
      .then((json) => setRecientes(json.data ?? []))
      .catch(() => {});
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {KPI_LABELS.map(({ key, label }) => (
          <Card key={key}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {stats ? (
                <p className="text-3xl font-bold">{stats[key]}</p>
              ) : (
                <Skeleton className="h-9 w-16" />
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Licitaciones recientes</CardTitle>
        </CardHeader>
        <CardContent>
          {recientes === null ? (
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
                  <li key={l.id} className="flex items-center justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <Link
                        href={`/licitaciones/${l.id}`}
                        className="font-medium hover:underline"
                      >
                        {l.numero_expediente} — {l.titulo}
                      </Link>
                      <p className="truncate text-sm text-muted-foreground">{l.institucion}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {descripcion || "Sin descripción (aún no se analiza con IA)"}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1 text-sm">
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
