"use client";

import { FileText, ShieldCheck, Sparkles, Trash2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { CATEGORIA_LABELS, ESTADO_DOT, ESTADO_LABELS } from "@/lib/checklist-labels";
import dynamic from "next/dynamic";

// P2 · F3 — react-pdf (~pdf.js) es pesado y solo se usa al abrir el visor.
// Carga diferida + sin SSR (usa `window`).
const PdfViewer = dynamic(
  () => import("@/components/licitaciones/pdf-viewer").then((m) => m.PdfViewer),
  { ssr: false, loading: () => <div className="p-8 text-center text-sm text-muted-foreground">Cargando visor…</div> },
);
import { FirmaDigitalDialog } from "@/components/licitaciones/firma-digital-dialog";
import {
  DOCUMENTOS_CONVOCANTE,
  useDocumentoConvocanteRow,
  useDocumentosRequeridosCard,
  useDocumentosTab,
  useRequisitoRow,
  type RequisitoChecklistItem,
} from "@/hooks/use-documentos-tab";
import type { Documento, ModalidadProcedimiento } from "@/types";

function RequisitoRow({
  item,
  licitacionId,
  organizationId,
  onUpdated,
}: {
  item: RequisitoChecklistItem;
  licitacionId: string;
  organizationId: string;
  onUpdated: () => void;
}) {
  const { analizando, quitando, toggleNoAplica, quitarDocumento, getRootProps, getInputProps, isDragActive } =
    useRequisitoRow(item, licitacionId, organizationId, onUpdated);

  const observaciones = item.documentos?.auditoria_json?.observaciones ?? [];

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-start gap-2">
        <span className={cn("mt-1 size-2.5 shrink-0 rounded-full", ESTADO_DOT[item.estado])} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {item.descripcion}
            {item.critico && (
              <span className="ml-2 inline-flex items-center rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                Crítico
              </span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {item.documentos?.nombre ?? "Sin documento cargado"} · {ESTADO_LABELS[item.estado]}
          </p>
          {observaciones.length > 0 && (
            <ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground">
              {observaciones.map((o, i) => (
                <li key={i}>{o}</li>
              ))}
            </ul>
          )}
        </div>
        {item.documento_id ? (
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={quitando}
            onClick={quitarDocumento}
            aria-label={`Quitar documento de ${item.descripcion}`}
          >
            <Trash2 className="text-destructive" />
          </Button>
        ) : (
          <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
            <Checkbox
              checked={item.estado === "GRIS"}
              onCheckedChange={(checked) => toggleNoAplica(checked === true)}
            />
            No aplica
          </label>
        )}
      </div>

      {item.estado !== "GRIS" && (
        <div
          {...getRootProps()}
          className={cn(
            "flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-2 text-xs",
            isDragActive ? "border-primary bg-primary/5" : "hover:bg-muted/40",
          )}
        >
          <input {...getInputProps()} />
          {analizando ? (
            <Sparkles className="size-3.5 animate-pulse text-primary" />
          ) : (
            <UploadCloud className="size-3.5 text-muted-foreground" />
          )}
          {analizando
            ? "Analizando con IA…"
            : item.documento_id
              ? "Reemplazar y volver a analizar"
              : "Cargar y analizar con IA"}
        </div>
      )}
    </div>
  );
}

function DocumentosRequeridosCard({
  licitacionId,
  organizationId,
}: {
  licitacionId: string;
  organizationId: string;
}) {
  const { checklist, cargar } = useDocumentosRequeridosCard(licitacionId);

  if (!checklist) {
    return <Skeleton className="h-48 w-full" />;
  }

  const grupos = Object.entries(
    checklist.reduce<Record<string, RequisitoChecklistItem[]>>((acc, item) => {
      (acc[item.categoria] ??= []).push(item);
      return acc;
    }, {}),
  );

  return (
    <div className="flex flex-col gap-4">
      {grupos.map(([categoria, items]) => (
        <Card key={categoria}>
          <CardHeader>
            <CardTitle className="text-sm">{CATEGORIA_LABELS[categoria] ?? categoria}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {items.map((item) => (
              <RequisitoRow
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
  );
}

// En una licitación Abierta no hay invitación privada de por medio — la
// convocatoria pública ya se cubre en "Otros documentos". Restringida e
// Invitación a Tres sí requieren la invitación. Sin modalidad definida
// (licitaciones antiguas) mostramos ambas por seguridad.
function documentosConvocantePara(modalidad: ModalidadProcedimiento | null) {
  if (modalidad === "ABIERTA") {
    return DOCUMENTOS_CONVOCANTE.filter((d) => d.tipo !== "INVITACION_PARTICIPAR");
  }
  return DOCUMENTOS_CONVOCANTE;
}

function DocumentoConvocanteRow({
  tipo,
  label,
  documento,
  licitacionId,
  organizationId,
  onOpen,
  noAplica,
  onToggleNoAplica,
}: {
  tipo: string;
  label: string;
  documento: Documento | undefined;
  licitacionId: string;
  organizationId: string;
  onOpen: (doc: Documento) => void;
  noAplica: boolean;
  onToggleNoAplica: (noAplica: boolean) => void;
}) {
  const { subiendo, quitando, quitarDocumento, getRootProps, getInputProps, isDragActive } =
    useDocumentoConvocanteRow(tipo, label, documento, licitacionId, organizationId);

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "size-2.5 shrink-0 rounded-full",
            documento ? "bg-emerald-500" : noAplica ? "bg-muted-foreground/40" : "bg-destructive",
          )}
        />
        <div className="min-w-0 flex-1">
          <p className={cn("text-sm font-medium", noAplica && !documento && "text-muted-foreground line-through")}>
            {label}
          </p>
          {documento ? (
            <button
              type="button"
              onClick={() => onOpen(documento)}
              className="truncate text-xs text-muted-foreground hover:underline"
            >
              {documento.nombre}
            </button>
          ) : (
            <p className="text-xs text-muted-foreground">Sin documento cargado</p>
          )}
        </div>
        {documento ? (
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={quitando}
            onClick={quitarDocumento}
            aria-label={`Quitar ${label}`}
          >
            <Trash2 className="text-destructive" />
          </Button>
        ) : (
          <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
            <Checkbox
              checked={noAplica}
              onCheckedChange={(checked) => onToggleNoAplica(checked === true)}
            />
            No aplica
          </label>
        )}
      </div>
      {!noAplica && (
        <div
          {...getRootProps()}
          className={cn(
            "flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-2 text-xs",
            isDragActive ? "border-primary bg-primary/5" : "hover:bg-muted/40",
          )}
        >
          <input {...getInputProps()} />
          <UploadCloud className="size-3.5 text-muted-foreground" />
          {subiendo ? "Subiendo…" : documento ? "Reemplazar" : "Cargar documento"}
        </div>
      )}
    </div>
  );
}

function DocumentosConvocanteCard({
  documentos,
  licitacionId,
  organizationId,
  modalidadProcedimiento,
  onOpen,
  noAplican,
  onToggleNoAplica,
}: {
  documentos: Documento[];
  licitacionId: string;
  organizationId: string;
  modalidadProcedimiento: ModalidadProcedimiento | null;
  onOpen: (doc: Documento) => void;
  noAplican: string[];
  onToggleNoAplica: (tipo: string, noAplica: boolean) => void;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 pt-6">
        {documentosConvocantePara(modalidadProcedimiento).map(({ tipo, label }) => (
          <DocumentoConvocanteRow
            key={tipo}
            tipo={tipo}
            label={label}
            documento={documentos.find((d) => d.tipo_documento === tipo)}
            licitacionId={licitacionId}
            organizationId={organizationId}
            onOpen={onOpen}
            noAplica={noAplican.includes(tipo)}
            onToggleNoAplica={(noAplica) => onToggleNoAplica(tipo, noAplica)}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function formatBytes(bytes: number | null) {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(1)} ${units[i]}`;
}

export function DocumentosTab({
  licitacionId,
  organizationId,
  initialDocumentos,
  modalidadProcedimiento,
  initialDocumentosConvocanteNoAplica,
}: {
  licitacionId: string;
  organizationId: string;
  initialDocumentos: Documento[];
  modalidadProcedimiento: ModalidadProcedimiento | null;
  initialDocumentosConvocanteNoAplica: string[];
}) {
  const {
    documentos,
    uploads,
    viewerDoc,
    setViewerDoc,
    viewerUrl,
    setViewerUrl,
    firmandoDoc,
    setFirmandoDoc,
    convocanteNoAplican,
    toggleConvocanteNoAplica,
    getRootProps,
    getInputProps,
    isDragActive,
    handleDelete,
    handleOpen,
  } = useDocumentosTab(licitacionId, organizationId, initialDocumentos, initialDocumentosConvocanteNoAplica);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-medium">Documentos de la convocante</h3>
        <p className="-mt-2 text-xs text-muted-foreground">
          Documentos que emite la dependencia: la solicitud de estudio de mercado (base para el
          estudio de mercado en Partidas) y, en su caso, la invitación a participar.
        </p>
        <DocumentosConvocanteCard
          documentos={documentos}
          licitacionId={licitacionId}
          organizationId={organizationId}
          modalidadProcedimiento={modalidadProcedimiento}
          onOpen={handleOpen}
          noAplican={convocanteNoAplican}
          onToggleNoAplica={toggleConvocanteNoAplica}
        />
      </div>

      <div className="flex flex-col gap-3" data-testid="documentos-requeridos-section">
        <h3 className="text-sm font-medium">Documentos requeridos</h3>
        <p className="-mt-2 text-xs text-muted-foreground">
          Sube cada documento en el requisito que le corresponde y se analizará con IA
          automáticamente.
        </p>
        <DocumentosRequeridosCard licitacionId={licitacionId} organizationId={organizationId} />
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-medium">Otros documentos</h3>
        <div
          {...getRootProps()}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-10 text-center transition-colors",
            isDragActive ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40",
          )}
        >
          <input {...getInputProps()} data-testid="otros-documentos-input" />
          <UploadCloud className="size-8 text-muted-foreground" />
          <p className="text-sm font-medium">
            {isDragActive ? "Suelta los archivos aquí" : "Arrastra archivos o haz clic para subir"}
          </p>
          <p className="text-xs text-muted-foreground">PDF, DOCX o XLSX — máximo 50MB</p>
        </div>
      </div>

      {uploads.length > 0 && (
        <div className="flex flex-col gap-2">
          {uploads.map((u) => (
            <div key={u.name} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{u.name}</span>
              <div className="h-1.5 w-32 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    u.status === "uploading" && "w-1/2 animate-pulse bg-primary",
                    u.status === "done" && "w-full bg-primary",
                    u.status === "error" && "w-full bg-destructive",
                  )}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <Card>
        <CardContent className="pt-6">
          {documentos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aún no hay documentos cargados.</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {documentos.map((doc) => (
                <li key={doc.id} className="flex items-center gap-3 py-3">
                  <FileText className="size-5 shrink-0 text-muted-foreground" />
                  <button
                    type="button"
                    onClick={() => handleOpen(doc)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="truncate text-sm font-medium hover:underline">
                      {doc.nombre}
                      {doc.firma_digital_json && (
                        <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-normal text-primary">
                          <ShieldCheck className="size-3" /> Firmado digitalmente
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatBytes(doc.tamanio_bytes)} ·{" "}
                      {doc.procesado ? "Procesado" : "Sin procesar"}
                    </p>
                  </button>
                  {doc.nombre.toLowerCase().endsWith(".pdf") && (
                    <Button variant="ghost" size="icon-sm" onClick={() => setFirmandoDoc(doc)}>
                      <ShieldCheck className="text-muted-foreground" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon-sm" onClick={() => handleDelete(doc)}>
                    <Trash2 className="text-destructive" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {firmandoDoc && (
        <FirmaDigitalDialog
          documentoId={firmandoDoc.id}
          storagePath={firmandoDoc.storage_path}
          open={!!firmandoDoc}
          onOpenChange={(open) => !open && setFirmandoDoc(null)}
          onFirmado={() => {
            setFirmandoDoc(null);
            // Recarga rápida vía realtime ya actualizará el registro; forzamos
            // un refresh optimista mientras tanto.
          }}
        />
      )}

      <PdfViewer
        url={viewerUrl}
        nombre={viewerDoc?.nombre ?? ""}
        open={!!viewerDoc}
        onOpenChange={(open) => {
          if (!open) {
            setViewerDoc(null);
            setViewerUrl(null);
          }
        }}
      />
    </div>
  );
}
