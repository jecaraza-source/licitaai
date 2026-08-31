"use client";

import { CheckCircle2, FileCheck2, ShieldAlert, TriangleAlert, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { IndiceMaestroCard } from "@/components/licitaciones/indice-maestro-card";
import { JerarquiaAutorizacionCard } from "@/components/licitaciones/jerarquia-autorizacion-card";
import { useEvidenciaEnvioCard, useLiberacionTab } from "@/hooks/use-liberacion-tab";

function formatFechaHora(fecha: string) {
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(fecha),
  );
}

function EvidenciaEnvioCard({
  licitacionId,
  organizationId,
}: {
  licitacionId: string;
  organizationId: string;
}) {
  const {
    evidencias,
    notas,
    setNotas,
    subiendo,
    archivo,
    getRootProps,
    getInputProps,
    isDragActive,
    registrar,
  } = useEvidenciaEnvioCard(licitacionId, organizationId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Evidencia de envío</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-xs text-muted-foreground">
          Guarda el acuse justo después de enviar en Compras MX: fecha, hora, pantalla de envío
          exitoso y la versión exacta enviada. Este registro no se edita — una nueva presentación
          agrega un registro nuevo.
        </p>

        {evidencias === null ? (
          <Skeleton className="h-16 w-full" />
        ) : evidencias.length > 0 ? (
          <ul className="flex flex-col divide-y">
            {evidencias.map((e) => (
              <li key={e.id} className="flex items-start gap-2 py-2 text-sm">
                <FileCheck2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                <div>
                  <p className="font-medium">{formatFechaHora(e.created_at)}</p>
                  {e.documento_nombre && (
                    <p className="text-xs text-muted-foreground">{e.documento_nombre}</p>
                  )}
                  {e.notas && <p className="text-xs text-muted-foreground">{e.notas}</p>}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Aún no se ha registrado ningún envío.</p>
        )}

        <div
          {...getRootProps()}
          className={cn(
            "flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-2 text-xs",
            isDragActive ? "border-primary bg-primary/5" : "hover:bg-muted/40",
          )}
        >
          <input {...getInputProps()} />
          <UploadCloud className="size-3.5 text-muted-foreground" />
          {subiendo ? "Subiendo…" : archivo ? archivo.nombre : "Arrastra el acuse (PDF/captura)"}
        </div>
        <Textarea
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          placeholder="Notas (número de folio, hora exacta, observaciones…)"
          className="min-h-16 resize-none text-sm"
        />
        <div className="flex justify-end">
          <Button size="sm" onClick={registrar} disabled={!archivo && !notas}>
            Registrar evidencia
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function LiberacionTab({
  licitacionId,
  organizationId,
  esInvestigacionMercado = false,
}: {
  licitacionId: string;
  organizationId: string;
  esInvestigacionMercado?: boolean;
}) {
  const { gate, cargar, toggleItem } = useLiberacionTab(licitacionId);

  if (!gate) {
    return <Skeleton className="h-96 w-full" />;
  }

  return (
    <div className="flex flex-col gap-6">
      <Card
        className={cn(
          "border-2",
          gate.bloqueado ? "border-destructive/40 bg-destructive/5" : "border-emerald-500/40 bg-emerald-500/5",
        )}
      >
        <CardContent className="flex flex-wrap items-center gap-4 pt-6">
          {gate.bloqueado ? (
            <ShieldAlert className="size-8 shrink-0 text-destructive" />
          ) : (
            <CheckCircle2 className="size-8 shrink-0 text-emerald-600" />
          )}
          <div className="flex-1">
            <p className="font-medium">
              {gate.bloqueado
                ? "El procedimiento no puede marcarse como enviado todavía"
                : "El procedimiento está listo para enviarse"}
            </p>
            <p className="text-sm text-muted-foreground">
              {gate.rojos} requisito(s) en rojo · {gate.amarillosCriticos} crítico(s) en amarillo ·{" "}
              {gate.pendientesLiberacion} punto(s) de este checklist sin confirmar ·{" "}
              {gate.jerarquiaAutorizada ? "Supervisor autorizó" : "falta autorización del Supervisor"}
              {gate.gateAprobacionIaActivo && (
                <>
                  {" · "}
                  {gate.analisisIaSinRevisar.length === 0
                    ? "análisis de IA revisados"
                    : `${gate.analisisIaSinRevisar.length} análisis de IA sin revisar`}
                </>
              )}
            </p>
            {gate.gateAprobacionIaActivo && gate.analisisIaSinRevisar.length > 0 && (
              <p className="mt-1 text-sm text-destructive">
                Revisa (aprobar/rechazar) los análisis de IA en la pestaña Análisis IA antes de
                enviar: {gate.analisisIaSinRevisar.map((a) => a.tipo_analisis).join(", ")}.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <JerarquiaAutorizacionCard licitacionId={licitacionId} onUpdated={cargar} />

      {(gate.rojos > 0 || gate.amarillosCriticos > 0) && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <p>
            Resuelve los requisitos en rojo y los críticos en amarillo desde la pestaña{" "}
            <strong>Auditoría</strong> antes de continuar.
          </p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            {esInvestigacionMercado
              ? "Checklist de intake — Investigación de Mercado"
              : "Checklist final de liberación"}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {gate.itemsLiberacion.map((item) => (
            <div key={item.id} className="flex items-start gap-2.5">
              <Checkbox
                id={item.id}
                checked={item.checked}
                onCheckedChange={(checked) => toggleItem(item.id, checked === true)}
              />
              <Label htmlFor={item.id} className="text-sm leading-snug font-normal">
                {item.label}
              </Label>
            </div>
          ))}
        </CardContent>
      </Card>

      {!esInvestigacionMercado && <IndiceMaestroCard licitacionId={licitacionId} />}

      <EvidenciaEnvioCard licitacionId={licitacionId} organizationId={organizationId} />
    </div>
  );
}
