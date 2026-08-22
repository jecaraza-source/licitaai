"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useDropzone } from "react-dropzone";
import { Sparkles, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, sanitizeFilename } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

interface Documento {
  id: string;
  nombre: string;
  auditoria_json: {
    valido: boolean;
    observaciones: string[];
    nivel_riesgo: "VERDE" | "AMARILLO" | "ROJO";
  } | null;
}

interface ChecklistItem {
  id: string;
  categoria: string;
  descripcion: string;
  fundamento_legal: string | null;
  vigencia_requerida: string | null;
  requerido: boolean;
  estado: "PENDIENTE" | "COMPLETO" | "NO_APLICA";
  documento_id: string | null;
  documentos: Documento | null;
}

interface PendienteCritico {
  descripcion: string;
  dias_estimados: number | null;
}

interface Reporte {
  resumen: string;
  pendientes_criticos: PendienteCritico[];
  advertencias: string[];
}

interface AuditoriaData {
  score: number;
  porCategoria: Record<string, { total: number; completos: number; pct: number }>;
  checklist: ChecklistItem[];
  ultimoReporte: Reporte | null;
}

const CATEGORIA_LABELS: Record<string, string> = {
  LEGAL: "Legal",
  FISCAL: "Fiscal",
  TECNICO: "Técnico",
  ECONOMICO: "Económico",
  ESPECIFICO: "Específico",
};

const RIESGO_STYLES: Record<string, string> = {
  VERDE: "bg-emerald-500",
  AMARILLO: "bg-amber-500",
  ROJO: "bg-destructive",
};

function scoreColor(score: number) {
  if (score >= 80) return "text-emerald-600";
  if (score >= 50) return "text-amber-600";
  return "text-destructive";
}

function ChecklistRow({
  item,
  licitacionId,
  organizationId,
  onUpdated,
}: {
  item: ChecklistItem;
  licitacionId: string;
  organizationId: string;
  onUpdated: () => void;
}) {
  const [subiendo, setSubiendo] = useState(false);
  const [expandido, setExpandido] = useState(false);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { "application/pdf": [".pdf"] },
    maxFiles: 1,
    onDrop: async ([file]) => {
      if (!file) return;
      setSubiendo(true);
      const supabase = createClient();
      const path = `${organizationId}/${licitacionId}/${Date.now()}-${sanitizeFilename(file.name)}`;
      const { error: uploadError } = await supabase.storage
        .from("documentos-requeridos")
        .upload(path, file);

      if (uploadError) {
        setSubiendo(false);
        toast.error("No se pudo subir el documento", { description: uploadError.message });
        return;
      }

      const { data: doc, error: insertError } = await supabase
        .from("documentos")
        .insert({
          licitacion_id: licitacionId,
          tipo_documento: item.categoria,
          nombre: file.name,
          storage_path: path,
          tamanio_bytes: file.size,
        })
        .select()
        .single();

      if (insertError || !doc) {
        setSubiendo(false);
        toast.error("No se pudo registrar el documento");
        return;
      }

      const res = await fetch(`/api/checklist-items/${item.id}/documento`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documento_id: doc.id }),
      });
      setSubiendo(false);

      if (!res.ok) {
        toast.error("No se pudo auditar el documento");
        return;
      }
      toast.success("Documento auditado");
      onUpdated();
    },
  });

  async function marcarNoAplica() {
    await fetch(`/api/checklist-items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado: "NO_APLICA" }),
    });
    onUpdated();
  }

  const riesgo = item.documentos?.auditoria_json?.nivel_riesgo;

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          className="flex flex-1 items-start gap-2 text-left"
          onClick={() => setExpandido((v) => !v)}
        >
          <span
            className={cn(
              "mt-1 size-2.5 shrink-0 rounded-full",
              item.estado === "COMPLETO" || item.estado === "NO_APLICA"
                ? "bg-emerald-500"
                : riesgo
                  ? RIESGO_STYLES[riesgo]
                  : "bg-muted-foreground/40",
            )}
          />
          <span>
            <p className="text-sm font-medium">{item.descripcion}</p>
            {item.fundamento_legal && (
              <p className="text-xs text-muted-foreground">{item.fundamento_legal}</p>
            )}
          </span>
        </button>
        <div className="flex shrink-0 gap-1">
          {item.estado === "PENDIENTE" && (
            <Button variant="ghost" size="sm" onClick={marcarNoAplica}>
              No aplica
            </Button>
          )}
        </div>
      </div>

      {expandido && (
        <div className="ml-4.5 flex flex-col gap-2">
          {item.documentos?.auditoria_json?.observaciones && (
            <ul className="list-disc pl-4 text-xs text-muted-foreground">
              {item.documentos.auditoria_json.observaciones.map((o, i) => (
                <li key={i}>{o}</li>
              ))}
            </ul>
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
            {subiendo
              ? "Auditando…"
              : item.documento_id
                ? "Reemplazar documento"
                : "Cargar documento"}
          </div>
        </div>
      )}
    </div>
  );
}

export function AuditoriaTab({
  licitacionId,
  organizationId,
}: {
  licitacionId: string;
  organizationId: string;
}) {
  const [data, setData] = useState<AuditoriaData | null>(null);
  const [auditando, setAuditando] = useState(false);

  function cargar() {
    fetch(`/api/licitaciones/${licitacionId}/auditoria`)
      .then((res) => res.json())
      .then((json) => setData(json.data));
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [licitacionId]);

  async function handleAuditarTodos() {
    setAuditando(true);
    const res = await fetch(`/api/licitaciones/${licitacionId}/auditoria/auditar-todos`, {
      method: "POST",
    });
    setAuditando(false);
    if (!res.ok) {
      toast.error("No se pudo completar la auditoría");
      return;
    }
    toast.success("Auditoría del expediente actualizada");
    cargar();
  }

  if (!data) {
    return <Skeleton className="h-96 w-full" />;
  }

  const grupos = Object.entries(
    data.checklist.reduce<Record<string, ChecklistItem[]>>((acc, item) => {
      (acc[item.categoria] ??= []).push(item);
      return acc;
    }, {}),
  );

  return (
    <div className="flex flex-col gap-6" id="auditoria-printable">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Button onClick={handleAuditarTodos} disabled={auditando}>
          <Sparkles />
          {auditando ? "Auditando…" : "Auditar todos los documentos con IA"}
        </Button>
        <Button variant="outline" onClick={() => window.print()}>
          Exportar reporte PDF
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="flex flex-col items-center justify-center py-8">
          <p className={cn("text-6xl font-bold", scoreColor(data.score))}>{data.score}</p>
          <p className="mt-1 text-sm text-muted-foreground">Score de expediente</p>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">Por categoría</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {Object.entries(data.porCategoria).map(([cat, info]) => (
              <div key={cat}>
                <div className="mb-1 flex justify-between text-xs">
                  <span>{CATEGORIA_LABELS[cat] ?? cat}</span>
                  <span className="text-muted-foreground">
                    {info.completos}/{info.total}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      info.pct >= 80 ? "bg-emerald-500" : info.pct >= 50 ? "bg-amber-500" : "bg-destructive",
                    )}
                    style={{ width: `${info.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {data.ultimoReporte && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Pendientes críticos</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">{data.ultimoReporte.resumen}</p>
            {data.ultimoReporte.pendientes_criticos.length > 0 && (
              <ul className="flex flex-col gap-1">
                {data.ultimoReporte.pendientes_criticos.map((p, i) => (
                  <li key={i} className="flex justify-between text-sm">
                    <span className="text-destructive">{p.descripcion}</span>
                    {p.dias_estimados !== null && (
                      <span className="text-xs text-muted-foreground">~{p.dias_estimados} días</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {data.ultimoReporte.advertencias.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground">Advertencias</p>
                <ul className="list-disc pl-4 text-sm text-muted-foreground">
                  {data.ultimoReporte.advertencias.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-4">
        {grupos.map(([categoria, items]) => (
          <Card key={categoria}>
            <CardHeader>
              <CardTitle className="text-sm">{CATEGORIA_LABELS[categoria] ?? categoria}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {items.map((item) => (
                <ChecklistRow
                  key={item.id}
                  item={item}
                  licitacionId={licitacionId}
                  organizationId={organizationId}
                  onUpdated={cargar}
                />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
