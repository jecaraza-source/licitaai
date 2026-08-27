"use client";

import { useEffect, useState } from "react";
import { TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface MetricasValor {
  documentos_procesados: number;
  analisis_generados: number;
  requisitos_detectados: number;
  tasa_aceptacion_humana_pct: number | null;
  resultados_rechazados: number;
  costo_ia_por_expediente_usd: number | null;
  licitaciones_enviadas: number;
}

const CAMPOS: Array<{ k: keyof MetricasValor; label: string; fmt?: (v: number) => string }> = [
  { k: "documentos_procesados", label: "Documentos procesados" },
  { k: "analisis_generados", label: "Análisis de IA generados" },
  { k: "requisitos_detectados", label: "Requisitos detectados" },
  { k: "licitaciones_enviadas", label: "Licitaciones enviadas" },
  { k: "tasa_aceptacion_humana_pct", label: "Aceptación humana de resultados", fmt: (v) => `${v}%` },
  { k: "resultados_rechazados", label: "Resultados marcados como incorrectos" },
  { k: "costo_ia_por_expediente_usd", label: "Coste de IA por expediente", fmt: (v) => `$${v.toFixed(2)}` },
];

export function MetricasValorCard() {
  const [m, setM] = useState<MetricasValor | null | undefined>(undefined);

  useEffect(() => {
    fetch("/api/organizacion/metricas-valor")
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => setM(body?.data ?? null))
      .catch(() => setM(null));
  }, []);

  if (m === null) return null; // sin permiso (ADMIN/MANAGER) o error — no se muestra

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="size-4 text-primary" /> Valor generado
        </CardTitle>
      </CardHeader>
      <CardContent>
        {m === undefined ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {CAMPOS.map(({ k, label, fmt }) => {
              const v = m[k];
              return (
                <div key={k}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="text-lg font-semibold">
                    {v == null ? "–" : fmt ? fmt(Number(v)) : v}
                  </dd>
                </div>
              );
            })}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
