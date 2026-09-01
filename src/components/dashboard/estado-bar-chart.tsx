"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { DashboardStats, EstadoLicitacion } from "@/types";

const ESTADOS: { key: EstadoLicitacion; label: string }[] = [
  { key: "NUEVA", label: "Nueva" },
  { key: "ANALISIS", label: "Análisis" },
  { key: "PREPARACION", label: "Preparación" },
  { key: "ENVIADA", label: "Enviada" },
  { key: "SEGUIMIENTO", label: "Seguimiento" },
  { key: "CERRADA", label: "Cerrada" },
];

export function EstadoBarChart({ porEstado }: { porEstado: DashboardStats["porEstado"] }) {
  const [activo, setActivo] = useState<EstadoLicitacion | null>(null);
  const max = Math.max(1, ...ESTADOS.map((e) => porEstado[e.key] ?? 0));
  const total = ESTADOS.reduce((sum, e) => sum + (porEstado[e.key] ?? 0), 0);

  if (total === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Aún no hay licitaciones registradas.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {ESTADOS.map((e) => {
        const valor = porEstado[e.key] ?? 0;
        const pct = (valor / max) * 100;
        return (
          <div
            key={e.key}
            className="group flex items-center gap-3"
            onPointerEnter={() => setActivo(e.key)}
            onPointerLeave={() => setActivo((a) => (a === e.key ? null : a))}
            onFocus={() => setActivo(e.key)}
            onBlur={() => setActivo((a) => (a === e.key ? null : a))}
            tabIndex={0}
          >
            <span className="w-20 shrink-0 text-xs text-muted-foreground">{e.label}</span>
            <div className="relative h-1.5 max-w-xs flex-1 bg-muted">
              <div
                className={cn(
                  "h-1.5 rounded-r-[4px] bg-primary transition-[filter]",
                  activo === e.key && "brightness-110",
                )}
                style={{ width: valor > 0 ? `${Math.max(pct, 4)}%` : 0 }}
              />
              {activo === e.key && (
                <div className="absolute top-full left-0 z-10 mt-1.5 rounded-md border bg-popover px-2 py-1 text-xs shadow-md">
                  <span className="font-semibold text-popover-foreground">{valor}</span>{" "}
                  <span className="text-muted-foreground">
                    licitación{valor === 1 ? "" : "es"} en {e.label.toLowerCase()}
                  </span>
                </div>
              )}
            </div>
            <span className="w-6 shrink-0 text-right text-xs font-semibold tabular-nums">
              {valor}
            </span>
          </div>
        );
      })}
    </div>
  );
}
