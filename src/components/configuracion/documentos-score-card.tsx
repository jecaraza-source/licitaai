"use client";

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { TIPOS_DOCUMENTO_CORPORATIVO } from "@/lib/documentos-corporativos";
import type { DocumentoCorporativo } from "@/types";

function estaVencido(vigenciaHasta: string | null): boolean {
  if (!vigenciaHasta) return false;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return new Date(`${vigenciaHasta}T00:00:00`).getTime() < hoy.getTime();
}

// Qué tan lista está la bóveda de documentos corporativos: de los tipos
// requeridos (sin contar los marcados "no aplica"), cuántos tienen al menos
// un documento subido, y de esos, cuántos además "validaron" — el más
// reciente de ese tipo no fue marcado como que no coincide con la empresa
// (coincide_empresa === false) ni está vencido. Mismo criterio que las
// insignias que ya se muestran por documento en "Documentos corporativos".
export function DocumentosScoreCard({ empresaId }: { empresaId: string }) {
  const [documentos, setDocumentos] = useState<DocumentoCorporativo[] | null>(null);
  const [noAplican, setNoAplican] = useState<string[]>([]);

  useEffect(() => {
    fetch(`/api/empresa-perfil/${empresaId}/documentos`)
      .then((res) => res.json())
      .then((json) => setDocumentos(json.data ?? []));
    fetch(`/api/empresa-perfil/${empresaId}`)
      .then((res) => res.json())
      .then((json) => setNoAplican(json.data?.documentos_no_aplican ?? []));
  }, [empresaId]);

  if (documentos === null) {
    return (
      <Card>
        <CardContent className="pt-6">
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  const tiposRequeridos = TIPOS_DOCUMENTO_CORPORATIVO.filter(
    (tipo) => tipo !== "Otro" && !noAplican.includes(tipo),
  );
  const total = tiposRequeridos.length;

  let subidos = 0;
  let validados = 0;
  for (const tipo of tiposRequeridos) {
    // Los documentos vienen ordenados del más reciente al más antiguo (ver
    // documentos-corporativos-card.tsx): el primero de cada tipo es el que
    // cuenta.
    const masReciente = documentos.find((d) => d.tipo === tipo);
    if (!masReciente) continue;
    subidos++;
    if (masReciente.coincide_empresa !== false && !estaVencido(masReciente.vigencia_hasta)) {
      validados++;
    }
  }

  const porcentaje = total > 0 ? Math.round((validados / total) * 100) : 0;
  const color =
    porcentaje >= 80 ? "text-emerald-600 dark:text-emerald-400" : porcentaje >= 40 ? "text-amber-600 dark:text-amber-400" : "text-destructive";
  const barra =
    porcentaje >= 80 ? "bg-emerald-500" : porcentaje >= 40 ? "bg-amber-500" : "bg-destructive";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-secondary text-primary">
            <ShieldCheck className="size-4" />
          </span>
          Score de documentos corporativos
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-end gap-3">
          <span className={cn("text-4xl font-bold tabular-nums", color)}>{porcentaje}%</span>
          <p className="pb-1 text-sm text-muted-foreground">
            {validados} de {total} documento{total === 1 ? "" : "s"} requeridos, subidos y
            validados
          </p>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full transition-all", barra)}
            style={{ width: `${porcentaje}%` }}
          />
        </div>
        {subidos > validados && (
          <p className="text-xs text-muted-foreground">
            {subidos} subido{subidos === 1 ? "" : "s"} en total — {subidos - validados} con datos
            que no coinciden con la empresa o vencidos.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
