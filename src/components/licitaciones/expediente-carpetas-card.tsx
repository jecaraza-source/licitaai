"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { TriangleAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CARPETAS_EXPEDIENTE, type CarpetaExpediente } from "@/lib/compras-mx";

// Paso 2 del proceso operativo de Compras MX: expediente completo, ordenado
// en la carpeta controlada 01–11.

interface DocumentoCarpeta {
  id: string;
  nombre: string;
  tipo_documento: string;
  carpeta: CarpetaExpediente | null;
}

const SIN_CARPETA = "__sin_carpeta__";

export function ExpedienteCarpetasCard({
  licitacionId,
  fuenteCompletaInicial,
}: {
  licitacionId: string;
  fuenteCompletaInicial: boolean;
}) {
  const [docs, setDocs] = useState<DocumentoCarpeta[] | null>(null);
  const [fuenteCompleta, setFuenteCompleta] = useState(fuenteCompletaInicial);

  const cargar = useCallback(() => {
    fetch(`/api/licitaciones/${licitacionId}/carpetas`)
      .then((res) => res.json())
      .then((json) => setDocs(json.data ?? []));
  }, [licitacionId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function asignar(documentoId: string, carpeta: CarpetaExpediente | null) {
    const res = await fetch(`/api/licitaciones/${licitacionId}/carpetas`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documento_id: documentoId, carpeta }),
    });
    if (!res.ok) {
      toast.error("No se pudo asignar la carpeta");
      return;
    }
    cargar();
  }

  async function marcarFuenteCompleta(valor: boolean) {
    const anterior = fuenteCompleta;
    setFuenteCompleta(valor);
    const res = await fetch(`/api/licitaciones/${licitacionId}/control`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expediente_fuente_completo: valor }),
    });
    if (!res.ok) {
      setFuenteCompleta(anterior);
      toast.error("No se pudo guardar");
    }
  }

  if (!docs) return <Skeleton className="h-48 w-full" />;

  const sinCarpeta = docs.filter((d) => !d.carpeta);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Expediente del procedimiento</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!fuenteCompleta && (
          <p className="flex items-start gap-1.5 rounded-lg bg-amber-500/10 p-2.5 text-xs font-medium text-amber-800">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            Aún hay documentos de la fuente sin descargar. No inicies la propuesta tomando solo la
            Invitación o el Anexo Técnico: descarga y registra todo el expediente.
          </p>
        )}
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={fuenteCompleta} onCheckedChange={(c) => marcarFuenteCompleta(c === true)} />
          Descargué y registré todos los documentos disponibles de la fuente
        </label>

        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {CARPETAS_EXPEDIENTE.map((c) => {
            const n = docs.filter((d) => d.carpeta === c.value).length;
            return (
              <div key={c.value} className="flex items-center justify-between rounded-md border px-2.5 py-1.5 text-sm">
                <span>{c.label}</span>
                <span className={n === 0 ? "text-xs text-muted-foreground" : "text-xs font-semibold"}>
                  {n === 0 ? "vacía" : `${n} doc.`}
                </span>
              </div>
            );
          })}
        </div>

        {docs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay documentos. Súbelos desde el tab Documentos.</p>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">
              {sinCarpeta.length > 0
                ? `${sinCarpeta.length} documento(s) sin carpeta`
                : "Todos los documentos están clasificados"}
            </p>
            <div className="flex flex-col divide-y rounded-lg border">
              {docs.map((d) => (
                <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 p-2">
                  <span className="min-w-0 flex-1 truncate text-sm">{d.nombre}</span>
                  <Select
                    value={d.carpeta ?? SIN_CARPETA}
                    onValueChange={(v) => asignar(d.id, v === SIN_CARPETA ? null : (v as CarpetaExpediente))}
                  >
                    <SelectTrigger size="sm" className="w-56" aria-label={`Carpeta de ${d.nombre}`}>
                      <SelectValue>
                        {(v: string | null) =>
                          !v || v === SIN_CARPETA
                            ? "Sin carpeta"
                            : (CARPETAS_EXPEDIENTE.find((c) => c.value === v)?.label ?? v)
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SIN_CARPETA}>Sin carpeta</SelectItem>
                      {CARPETAS_EXPEDIENTE.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
