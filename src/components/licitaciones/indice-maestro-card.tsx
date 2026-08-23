"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Fila {
  codigo: string;
  descripcion: string;
}

const CATEGORIA_PREFIJO: Record<string, string> = {
  LEGAL: "A",
  FISCAL: "A",
  ECONOMICO: "E",
  ESPECIFICO: "C",
};

export function IndiceMaestroCard({ licitacionId }: { licitacionId: string }) {
  const [grupos, setGrupos] = useState<Record<string, Fila[]> | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`/api/licitaciones/${licitacionId}/auditoria`).then((res) => res.json()),
      fetch(`/api/licitaciones/${licitacionId}/requisitos-tecnicos`).then((res) => res.json()),
    ]).then(([auditoria, requisitos]) => {
      const contadores: Record<string, number> = { A: 0, T: 0, E: 0, C: 0 };
      const grupo: Record<string, Fila[]> = { A: [], T: [], E: [], C: [] };

      for (const item of auditoria.data?.checklist ?? []) {
        const prefijo = item.categoria === "TECNICO" ? "T" : (CATEGORIA_PREFIJO[item.categoria] ?? "C");
        contadores[prefijo] += 1;
        grupo[prefijo].push({
          codigo: `${prefijo}${String(contadores[prefijo]).padStart(2, "0")}`,
          descripcion: item.descripcion,
        });
      }

      for (const req of requisitos.data ?? []) {
        contadores.T += 1;
        grupo.T.push({
          codigo: `T${String(contadores.T).padStart(2, "0")}`,
          descripcion: req.requisito,
        });
      }

      setGrupos(grupo);
    });
  }, [licitacionId]);

  if (!grupos) return null;

  const secciones = [
    { key: "A", label: "Legal-administrativa" },
    { key: "T", label: "Técnica" },
    { key: "E", label: "Económica" },
    { key: "C", label: "Complementaria" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Índice maestro de la proposición</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {secciones.map(({ key, label }) => (
          <div key={key}>
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              {key}. {label}
            </p>
            {grupos[key].length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin renglones todavía.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {grupos[key].map((fila) => (
                  <li key={fila.codigo} className="flex gap-2 text-sm">
                    <span className="w-10 shrink-0 font-mono text-xs text-muted-foreground">
                      {fila.codigo}
                    </span>
                    <span className="truncate">{fila.descripcion}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
