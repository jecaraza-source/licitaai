"use client";

import { CheckCircle2, Sparkles, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { usePropuestaEconomicaTab } from "@/hooks/use-propuesta-economica-tab";

function formatMonto(monto: number | null) {
  if (monto === null || Number.isNaN(monto)) return "—";
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(monto);
}

export function PropuestaEconomicaTab({ licitacionId }: { licitacionId: string }) {
  const {
    filas,
    guardando,
    analizando,
    dictamen,
    actualizarPrecio,
    actualizarComprasMx,
    resumen,
    handleGuardar,
    handleAnalizar,
    exportarExcel,
  } = usePropuestaEconomicaTab(licitacionId);

  if (filas === null) {
    return <Skeleton className="h-96 w-full" />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Captura el precio unitario ofertado por partida. IVA calculado al 16%.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportarExcel} disabled={filas.length === 0}>
            Exportar Excel
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            Exportar PDF
          </Button>
          <Button variant="outline" onClick={handleAnalizar} disabled={analizando}>
            <Sparkles />
            {analizando ? "Analizando…" : "Analizar competitividad con IA"}
          </Button>
          <Button onClick={handleGuardar} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </div>

      {dictamen && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-sm">Dictamen de competitividad</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{dictamen}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="overflow-x-auto pt-6">
          {filas.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay partidas. Analiza las bases con IA primero.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Partida</TableHead>
                  <TableHead>Cantidad</TableHead>
                  <TableHead>Unidad</TableHead>
                  <TableHead>P.U. Referencia</TableHead>
                  <TableHead>P.U. Ofertado</TableHead>
                  <TableHead>Diferencia %</TableHead>
                  <TableHead>IVA</TableHead>
                  <TableHead>Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filas.map((f, i) => {
                  const alerta =
                    f.margen_porcentaje !== null
                      ? f.margen_porcentaje > 15
                        ? "alto"
                        : f.margen_porcentaje < -40
                          ? "bajo"
                          : null
                      : null;
                  return (
                    <TableRow key={f.id}>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell className="max-w-xs truncate">{f.descripcion}</TableCell>
                      <TableCell>{f.cantidad ?? "—"}</TableCell>
                      <TableCell>{f.unidad ?? "—"}</TableCell>
                      <TableCell>{formatMonto(f.precio_referencia_mercado)}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          className="w-28"
                          value={f.precio_unitario_ofertado ?? ""}
                          onChange={(e) => actualizarPrecio(f.id, e.target.value)}
                        />
                      </TableCell>
                      <TableCell
                        className={cn(
                          alerta === "alto" && "font-medium text-amber-600",
                          alerta === "bajo" && "font-medium text-destructive",
                        )}
                      >
                        {f.margen_porcentaje !== null ? `${f.margen_porcentaje.toFixed(1)}%` : "—"}
                      </TableCell>
                      <TableCell>{formatMonto(f.iva)}</TableCell>
                      <TableCell className="font-medium">{formatMonto(f.total)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {filas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Conciliación con Compras MX</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <p className="mb-3 text-xs text-muted-foreground">
              Compras MX no expone una API pública, así que este dato se captura a mano justo
              después de cargar el importe en la plataforma. Ambos totales deben originarse de la
              misma hoja maestra — cualquier diferencia indica un error de captura.
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Partida</TableHead>
                  <TableHead>Total hoja maestra</TableHead>
                  <TableHead>Total capturado en Compras MX</TableHead>
                  <TableHead>Concilia</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filas.map((f, i) => {
                  const concilia =
                    f.total_compras_mx !== null &&
                    f.total !== null &&
                    Math.abs(f.total_compras_mx - f.total) < 1;
                  return (
                    <TableRow key={f.id}>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell className="max-w-xs truncate">{f.descripcion}</TableCell>
                      <TableCell>{formatMonto(f.total)}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          className="w-32"
                          value={f.total_compras_mx ?? ""}
                          onChange={(e) =>
                            actualizarComprasMx(f.id, "total_compras_mx", e.target.value)
                          }
                        />
                      </TableCell>
                      <TableCell>
                        {f.total_compras_mx === null ? (
                          <span className="text-xs text-muted-foreground">Pendiente</span>
                        ) : concilia ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                            <CheckCircle2 className="size-3.5" /> Concilia
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
                            <TriangleAlert className="size-3.5" /> No concilia
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card className="max-w-sm self-end">
        <CardContent className="flex flex-col gap-1 pt-6 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span>{formatMonto(resumen.subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">IVA (16%)</span>
            <span>{formatMonto(resumen.iva)}</span>
          </div>
          <div className="flex justify-between border-t pt-1 text-base font-bold">
            <span>Total general</span>
            <span>{formatMonto(resumen.total)}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
