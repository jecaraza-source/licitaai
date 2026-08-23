"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useDropzone } from "react-dropzone";
import { CheckCircle2, FileCheck2, ShieldAlert, TriangleAlert, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { cn, sanitizeFilename } from "@/lib/utils";
import { IndiceMaestroCard } from "@/components/licitaciones/indice-maestro-card";
import type { ChecklistLiberacionItem, EvidenciaEnvio } from "@/types";

interface GateStatus {
  rojos: number;
  amarillosCriticos: number;
  pendientesLiberacion: number;
  itemsLiberacion: ChecklistLiberacionItem[];
  bloqueado: boolean;
}

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
  const [evidencias, setEvidencias] = useState<EvidenciaEnvio[] | null>(null);
  const [notas, setNotas] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const [archivo, setArchivo] = useState<{ id: string; nombre: string } | null>(null);

  function cargarEvidencias() {
    fetch(`/api/licitaciones/${licitacionId}/evidencia-envio`)
      .then((res) => res.json())
      .then((json) => setEvidencias(json.data ?? []));
  }

  useEffect(() => {
    cargarEvidencias();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [licitacionId]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    maxFiles: 1,
    onDrop: async ([file]) => {
      if (!file) return;
      setSubiendo(true);
      const supabase = createClient();
      const path = `${organizationId}/${licitacionId}/${Date.now()}-${sanitizeFilename(file.name)}`;
      const { error: uploadError } = await supabase.storage
        .from("documentos-originales")
        .upload(path, file);

      if (uploadError) {
        setSubiendo(false);
        toast.error("No se pudo subir el archivo", { description: uploadError.message });
        return;
      }

      const { data: doc, error: insertError } = await supabase
        .from("documentos")
        .insert({
          licitacion_id: licitacionId,
          tipo_documento: "ACUSE_ENVIO",
          nombre: file.name,
          storage_path: path,
          tamanio_bytes: file.size,
        })
        .select()
        .single();
      setSubiendo(false);

      if (insertError || !doc) {
        toast.error("No se pudo registrar el archivo");
        return;
      }
      setArchivo({ id: doc.id, nombre: doc.nombre });
    },
  });

  async function registrar() {
    const res = await fetch(`/api/licitaciones/${licitacionId}/evidencia-envio`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documento_id: archivo?.id ?? null, notas: notas || null }),
    });
    if (!res.ok) {
      toast.error("No se pudo registrar la evidencia");
      return;
    }
    toast.success("Evidencia de envío registrada");
    setNotas("");
    setArchivo(null);
    cargarEvidencias();
  }

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
  const [gate, setGate] = useState<GateStatus | null>(null);

  function cargar() {
    fetch(`/api/licitaciones/${licitacionId}/liberacion`)
      .then((res) => res.json())
      .then((json) => setGate(json.data));
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [licitacionId]);

  async function toggleItem(itemId: string, checked: boolean) {
    setGate((prev) =>
      prev
        ? {
            ...prev,
            itemsLiberacion: prev.itemsLiberacion.map((i) =>
              i.id === itemId ? { ...i, checked } : i,
            ),
          }
        : prev,
    );

    const res = await fetch(`/api/licitaciones/${licitacionId}/liberacion`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId, checked }),
    });

    if (!res.ok) {
      toast.error("No se pudo guardar el checklist de liberación");
      cargar();
      return;
    }
    const json = await res.json();
    setGate(json.data);
  }

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
              {gate.pendientesLiberacion} punto(s) de este checklist sin confirmar
            </p>
          </div>
        </CardContent>
      </Card>

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
