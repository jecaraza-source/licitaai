"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Sparkles, Info } from "lucide-react";
import ExcelJS from "exceljs";
import { descargarWorkbook } from "@/lib/exportar-excel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { EstudioMercado, NivelConfianza, Partida } from "@/types";

type PartidaConEstudio = Partida & { estudio_mercado: EstudioMercado | null };

const SEMAFORO: Record<NivelConfianza, string> = {
  ALTO: "bg-emerald-500",
  MEDIO: "bg-amber-500",
  BAJO: "bg-destructive",
};

function formatMonto(monto: number | null) {
  if (monto === null || monto === undefined) return "—";
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(monto);
}

export function PartidasTab({ licitacionId }: { licitacionId: string }) {
  const [partidas, setPartidas] = useState<PartidaConEstudio[] | null>(null);
  const [generandoTodas, setGenerandoTodas] = useState(false);
  const [generandoId, setGenerandoId] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<PartidaConEstudio | null>(null);
  const [solicitudNombre, setSolicitudNombre] = useState<string | null>(null);

  function cargar() {
    fetch(`/api/licitaciones/${licitacionId}/partidas`)
      .then((res) => res.json())
      .then((json) => setPartidas(json.data ?? []))
      .catch(() => setPartidas([]));
  }

  useEffect(() => {
    cargar();
    createClient()
      .from("documentos")
      .select("nombre")
      .eq("licitacion_id", licitacionId)
      .eq("tipo_documento", "SOLICITUD_ESTUDIO_MERCADO")
      .maybeSingle()
      .then(({ data }) => setSolicitudNombre(data?.nombre ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [licitacionId]);

  async function generarEstudio(partidaId?: string) {
    if (partidaId) setGenerandoId(partidaId);
    else setGenerandoTodas(true);

    const res = await fetch(`/api/licitaciones/${licitacionId}/estudio-mercado`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(partidaId ? { partida_id: partidaId } : {}),
    });
    const json = await res.json();

    setGenerandoId(null);
    setGenerandoTodas(false);

    if (!res.ok) {
      toast.error("No se pudo generar el estudio de mercado", { description: json.error?.message ?? json.error });
      return;
    }

    toast.success("Estudio de mercado generado");
    cargar();
  }

  async function exportarExcel() {
    if (!partidas) return;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Partidas");
    sheet.columns = [
      { header: "Número", key: "numero" },
      { header: "Descripción", key: "descripcion" },
      { header: "Unidad", key: "unidad" },
      { header: "Cantidad", key: "cantidad" },
      { header: "P.U. Referencia", key: "puReferencia" },
      { header: "Confianza", key: "confianza" },
    ];
    for (const p of partidas) {
      sheet.addRow({
        numero: p.numero,
        descripcion: p.descripcion,
        unidad: p.unidad ?? "",
        cantidad: p.cantidad ?? "",
        puReferencia: p.estudio_mercado?.precio_recomendado ?? p.precio_unitario_referencia ?? "",
        confianza: p.estudio_mercado?.nivel_confianza ?? "",
      });
    }
    await descargarWorkbook(workbook, "partidas.xlsx");
  }

  if (partidas === null) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Partidas extraídas del análisis IA. Genera un estudio de mercado para estimar el
          precio de referencia.
          {solicitudNombre ? (
            <span className="block text-xs">
              Basado en la solicitud de estudio de mercado: <strong>{solicitudNombre}</strong>
            </span>
          ) : (
            <span className="block text-xs text-amber-600">
              No has cargado la solicitud de estudio de mercado (pestaña Documentos).
            </span>
          )}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportarExcel} disabled={partidas.length === 0}>
            Exportar Excel
          </Button>
          <Button
            onClick={() => generarEstudio()}
            disabled={generandoTodas || partidas.length === 0}
          >
            <Sparkles />
            {generandoTodas ? "Generando…" : "Generar estudio de mercado (todas)"}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          {partidas.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay partidas. Analiza las bases con IA en la pestaña Análisis IA primero.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Unidad</TableHead>
                  <TableHead>Cantidad</TableHead>
                  <TableHead>P.U. Referencia</TableHead>
                  <TableHead>Confianza</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {partidas.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{p.numero}</TableCell>
                    <TableCell className="max-w-xs truncate">{p.descripcion}</TableCell>
                    <TableCell>{p.unidad ?? "—"}</TableCell>
                    <TableCell>{p.cantidad ?? "—"}</TableCell>
                    <TableCell>
                      {formatMonto(p.estudio_mercado?.precio_recomendado ?? p.precio_unitario_referencia)}
                    </TableCell>
                    <TableCell>
                      {p.estudio_mercado ? (
                        <span
                          className={cn(
                            "inline-block size-2.5 rounded-full",
                            SEMAFORO[p.estudio_mercado.nivel_confianza ?? "BAJO"],
                          )}
                          title={p.estudio_mercado.nivel_confianza ?? undefined}
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">Sin estudio</span>
                      )}
                    </TableCell>
                    <TableCell className="flex justify-end gap-1">
                      {p.estudio_mercado && (
                        <Button variant="ghost" size="icon-sm" onClick={() => setDetalle(p)}>
                          <Info />
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={generandoId === p.id}
                        onClick={() => generarEstudio(p.id)}
                      >
                        {generandoId === p.id ? "Generando…" : "Generar estudio"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!detalle} onOpenChange={(open) => !open && setDetalle(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fuentes de precio — Partida {detalle?.numero}</DialogTitle>
          </DialogHeader>
          {detalle?.estudio_mercado && (
            <div className="flex flex-col gap-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <p>
                  <span className="text-muted-foreground">Mínimo: </span>
                  {formatMonto(detalle.estudio_mercado.precio_minimo)}
                </p>
                <p>
                  <span className="text-muted-foreground">Máximo: </span>
                  {formatMonto(detalle.estudio_mercado.precio_maximo)}
                </p>
                <p>
                  <span className="text-muted-foreground">Promedio: </span>
                  {formatMonto(detalle.estudio_mercado.precio_promedio)}
                </p>
                <p>
                  <span className="text-muted-foreground">Recomendado: </span>
                  {formatMonto(detalle.estudio_mercado.precio_recomendado)}
                </p>
              </div>
              {detalle.estudio_mercado.observaciones && (
                <p className="text-muted-foreground">{detalle.estudio_mercado.observaciones}</p>
              )}
              <div className="flex flex-col divide-y">
                {detalle.estudio_mercado.fuentes_json.map((f, i) => (
                  <div key={i} className="py-2">
                    <p className="font-medium">{f.nombre}</p>
                    <p className="text-xs text-muted-foreground">
                      {f.precio !== null ? formatMonto(f.precio) : "Sin precio"}
                      {f.fecha ? ` · ${f.fecha}` : ""}
                    </p>
                    {f.url && (
                      <a
                        href={f.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline"
                      >
                        {f.url}
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
