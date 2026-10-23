"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ESTADO_DOT } from "@/lib/checklist-labels";
import {
  PREGUNTAS,
  preguntasRespondidas,
  respuestasTrazabilidad,
  type RequisitoTrazable,
} from "@/lib/trazabilidad";

// §28 del proceso operativo de Compras MX — regla de trazabilidad: para cada
// requisito debe poder responderse de inmediato las 7 preguntas. Es una vista
// de lectura sobre la matriz; se edita desde cada renglón de la matriz.

export function TrazabilidadRequisitosCard({ items }: { items: RequisitoTrazable[] }) {
  const [abierto, setAbierto] = useState(false);

  const ordenados = items
    .filter((i) => !i.padre_id)
    .flatMap((padre) => [padre, ...items.filter((h) => h.padre_id === padre.id)]);
  const completos = ordenados.filter((r) => preguntasRespondidas(r) === PREGUNTAS.length).length;

  return (
    <Card>
      <CardHeader>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 text-left"
          aria-expanded={abierto}
          onClick={() => setAbierto((v) => !v)}
        >
          <CardTitle className="text-sm">
            Trazabilidad por requisito{" "}
            <span className="font-normal text-muted-foreground">
              — {completos} de {ordenados.length} con las 7 preguntas respondidas
            </span>
          </CardTitle>
          <ChevronDown className={cn("size-4 shrink-0 transition-transform", abierto && "rotate-180")} />
        </button>
      </CardHeader>
      {abierto && (
        <CardContent className="overflow-x-auto">
          {ordenados.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aún no hay requisitos en la matriz.</p>
          ) : (
            <table className="w-full min-w-[56rem] border-collapse text-xs">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-1.5 pr-2 font-medium">Requisito</th>
                  {PREGUNTAS.filter((p) => p.id !== "que_exige").map((p) => (
                    <th key={p.id} className="px-2 py-1.5 font-medium">
                      {p.label}
                    </th>
                  ))}
                  <th className="px-2 py-1.5 font-medium">Respondidas</th>
                </tr>
              </thead>
              <tbody>
                {ordenados.map((r) => {
                  const resp = respuestasTrazabilidad(r);
                  const n = preguntasRespondidas(r);
                  return (
                    <tr key={r.id} className="border-b align-top last:border-0">
                      <td className={cn("max-w-64 py-1.5 pr-2", r.padre_id && "pl-4")}>
                        <span className="flex items-start gap-1.5">
                          <span className={cn("mt-1 size-2 shrink-0 rounded-full", ESTADO_DOT[r.estado])} />
                          <span>
                            {r.padre_id && <span aria-hidden>↳ </span>}
                            {resp.que_exige}
                          </span>
                        </span>
                      </td>
                      {PREGUNTAS.filter((p) => p.id !== "que_exige").map((p) => {
                        const v = resp[p.id];
                        const pendiente = v === null || v === "No";
                        return (
                          <td
                            key={p.id}
                            className={cn("px-2 py-1.5", pendiente ? "text-muted-foreground" : "text-foreground")}
                          >
                            {v ?? "—"}
                          </td>
                        );
                      })}
                      <td
                        className={cn(
                          "px-2 py-1.5 font-semibold tabular-nums",
                          n === PREGUNTAS.length ? "text-emerald-600" : "text-amber-600",
                        )}
                      >
                        {n}/{PREGUNTAS.length}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      )}
    </Card>
  );
}
