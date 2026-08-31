"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Tabs } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

interface TabDef {
  value: string;
  label: string;
}

interface TabGrupo {
  label: string;
  tabs: TabDef[];
}

// Agrupa las 13 pestañas en 5 categorías por fase del proceso, para que la
// barra de navegación no obligue a hacer scroll horizontal por una fila
// larga: un primer nivel de categorías, y — solo si la categoría activa
// tiene más de una pestaña — un segundo nivel con las pestañas de esa
// categoría.
const GRUPOS: TabGrupo[] = [
  { label: "Resumen", tabs: [{ value: "resumen", label: "Resumen" }] },
  {
    label: "Documentos",
    tabs: [
      { value: "documentos", label: "Documentos" },
      { value: "documentos-legales", label: "Documentos Legales" },
      { value: "documentos-tecnicos", label: "Documentos Técnicos" },
    ],
  },
  {
    label: "Análisis",
    tabs: [
      { value: "analisis", label: "Análisis IA" },
      { value: "viabilidad", label: "Viabilidad" },
    ],
  },
  {
    label: "Propuesta",
    tabs: [
      { value: "partidas", label: "Partidas" },
      { value: "propuesta-tecnica", label: "Propuesta Técnica" },
      { value: "propuesta-economica", label: "Propuesta Económica" },
    ],
  },
  {
    label: "Proceso",
    tabs: [
      { value: "auditoria", label: "Auditoría" },
      { value: "liberacion", label: "Liberación" },
      { value: "junta", label: "Junta de Aclaraciones" },
      { value: "seguimiento", label: "Seguimiento" },
    ],
  },
];

export function LicitacionTabsNav({ children }: { children: ReactNode }) {
  const [tab, setTab] = useState("resumen");

  const grupoActivo = useMemo(
    () => GRUPOS.find((grupo) => grupo.tabs.some((t) => t.value === tab)) ?? GRUPOS[0],
    [tab],
  );

  return (
    <Tabs value={tab} onValueChange={(v) => v && setTab(v)}>
      <div className="flex flex-col gap-1.5">
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <div className="flex w-max gap-1 rounded-lg bg-muted p-[3px]">
            {GRUPOS.map((grupo) => {
              const activo = grupo === grupoActivo;
              return (
                <button
                  key={grupo.label}
                  type="button"
                  onClick={() => setTab(grupo.tabs[0].value)}
                  className={cn(
                    "whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-colors",
                    activo
                      ? "bg-background text-foreground shadow-sm dark:bg-input/30"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {grupo.label}
                </button>
              );
            })}
          </div>
        </div>

        {grupoActivo.tabs.length > 1 && (
          <div className="-mx-1 overflow-x-auto px-1">
            <div className="flex w-max gap-3 border-b">
              {grupoActivo.tabs.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setTab(t.value)}
                  className={cn(
                    "-mb-px whitespace-nowrap border-b-2 px-1 py-1.5 text-sm font-medium transition-colors",
                    tab === t.value
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {children}
    </Tabs>
  );
}
