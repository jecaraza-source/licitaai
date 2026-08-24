"use client";

import { useCallback, useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import { FileText, ShieldCheck, Sparkles, Trash2, UploadCloud } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, sanitizeFilename } from "@/lib/utils";
import { CATEGORIA_LABELS, ESTADO_DOT, ESTADO_LABELS } from "@/lib/checklist-labels";
import { PdfViewer } from "@/components/licitaciones/pdf-viewer";
import { FirmaDigitalDialog } from "@/components/licitaciones/firma-digital-dialog";
import type { Documento, EstadoChecklistItem, ModalidadProcedimiento } from "@/types";

interface RequisitoDocumento {
  id: string;
  nombre: string;
  auditoria_json: {
    valido: boolean;
    observaciones: string[];
    nivel_riesgo: EstadoChecklistItem;
  } | null;
}

interface RequisitoChecklistItem {
  id: string;
  categoria: string;
  descripcion: string;
  critico: boolean;
  estado: EstadoChecklistItem;
  documento_id: string | null;
  documentos: RequisitoDocumento | null;
}

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
  const [analizando, setAnalizando] = useState(false);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { "application/pdf": [".pdf"] },
    maxFiles: 1,
    onDrop: async ([file]) => {
      if (!file) return;
      setAnalizando(true);
      const supabase = createClient();
      const path = `${organizationId}/${licitacionId}/${Date.now()}-${sanitizeFilename(file.name)}`;
      const { error: uploadError } = await supabase.storage
        .from("documentos-requeridos")
        .upload(path, file);

      if (uploadError) {
        setAnalizando(false);
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
        setAnalizando(false);
        toast.error("No se pudo registrar el documento");
        return;
      }

      const res = await fetch(`/api/checklist-items/${item.id}/documento`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documento_id: doc.id }),
      });
      setAnalizando(false);

      if (!res.ok) {
        toast.error("No se pudo analizar el documento con IA");
        return;
      }
      toast.success(`"${item.descripcion}" analizado con IA`);
      onUpdated();
    },
  });

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
      </div>

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
  const [checklist, setChecklist] = useState<RequisitoChecklistItem[] | null>(null);

  const cargar = useCallback(() => {
    fetch(`/api/licitaciones/${licitacionId}/auditoria`)
      .then((res) => res.json())
      .then((json) => setChecklist(json.data?.checklist ?? []));
  }, [licitacionId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

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

const DOCUMENTOS_CONVOCANTE = [
  { tipo: "SOLICITUD_ESTUDIO_MERCADO", label: "Solicitud de Estudio de Mercado" },
  { tipo: "INVITACION_PARTICIPAR", label: "Invitación a Participar" },
];

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

const ACCEPTED = {
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
};

const MAX_SIZE = 50 * 1024 * 1024;
const BUCKET = "documentos-originales";

function DocumentoConvocanteRow({
  tipo,
  label,
  documento,
  licitacionId,
  organizationId,
  onOpen,
}: {
  tipo: string;
  label: string;
  documento: Documento | undefined;
  licitacionId: string;
  organizationId: string;
  onOpen: (doc: Documento) => void;
}) {
  const [subiendo, setSubiendo] = useState(false);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { "application/pdf": [".pdf"] },
    maxFiles: 1,
    onDrop: async ([file]) => {
      if (!file) return;
      setSubiendo(true);
      const supabase = createClient();
      const path = `${organizationId}/${licitacionId}/${Date.now()}-${sanitizeFilename(file.name)}`;
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file);

      if (uploadError) {
        setSubiendo(false);
        toast.error("No se pudo subir el documento", { description: uploadError.message });
        return;
      }

      const { error: insertError } = await supabase.from("documentos").insert({
        licitacion_id: licitacionId,
        tipo_documento: tipo,
        nombre: file.name,
        storage_path: path,
        tamanio_bytes: file.size,
      });
      setSubiendo(false);

      if (insertError) {
        toast.error("No se pudo registrar el documento");
        return;
      }
      toast.success(`"${label}" guardado`);
    },
  });

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "size-2.5 shrink-0 rounded-full",
            documento ? "bg-emerald-500" : "bg-destructive",
          )}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{label}</p>
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
      </div>
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
    </div>
  );
}

function DocumentosConvocanteCard({
  documentos,
  licitacionId,
  organizationId,
  modalidadProcedimiento,
  onOpen,
}: {
  documentos: Documento[];
  licitacionId: string;
  organizationId: string;
  modalidadProcedimiento: ModalidadProcedimiento | null;
  onOpen: (doc: Documento) => void;
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

type UploadState = { name: string; status: "uploading" | "done" | "error" };

export function DocumentosTab({
  licitacionId,
  organizationId,
  initialDocumentos,
  modalidadProcedimiento,
}: {
  licitacionId: string;
  organizationId: string;
  initialDocumentos: Documento[];
  modalidadProcedimiento: ModalidadProcedimiento | null;
}) {
  const [documentos, setDocumentos] = useState<Documento[]>(initialDocumentos);
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const [viewerDoc, setViewerDoc] = useState<Documento | null>(null);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [firmandoDoc, setFirmandoDoc] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`documentos-${licitacionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "documentos",
          filter: `licitacion_id=eq.${licitacionId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const nuevo = payload.new as Documento;
            setDocumentos((prev) =>
              prev.some((d) => d.id === nuevo.id) ? prev : [nuevo, ...prev],
            );
          } else if (payload.eventType === "UPDATE") {
            const actualizado = payload.new as Documento;
            setDocumentos((prev) =>
              prev.map((d) => (d.id === actualizado.id ? actualizado : d)),
            );
            if (actualizado.procesado) {
              toast.success(`"${actualizado.nombre}" terminó de procesarse`);
            }
          } else if (payload.eventType === "DELETE") {
            const eliminado = payload.old as Documento;
            setDocumentos((prev) => prev.filter((d) => d.id !== eliminado.id));
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [licitacionId]);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const supabase = createClient();

      for (const file of acceptedFiles) {
        setUploads((prev) => [...prev, { name: file.name, status: "uploading" }]);
        const path = `${organizationId}/${licitacionId}/${Date.now()}-${sanitizeFilename(file.name)}`;

        const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file);

        if (uploadError) {
          setUploads((prev) =>
            prev.map((u) => (u.name === file.name ? { ...u, status: "error" } : u)),
          );
          toast.error(`No se pudo subir "${file.name}"`, { description: uploadError.message });
          continue;
        }

        const { data, error: insertError } = await supabase
          .from("documentos")
          .insert({
            licitacion_id: licitacionId,
            tipo_documento: file.name.split(".").pop()?.toUpperCase() ?? "OTRO",
            nombre: file.name,
            storage_path: path,
            tamanio_bytes: file.size,
          })
          .select()
          .single();

        if (insertError) {
          toast.error(`No se pudo registrar "${file.name}"`, { description: insertError.message });
          setUploads((prev) =>
            prev.map((u) => (u.name === file.name ? { ...u, status: "error" } : u)),
          );
          continue;
        }

        setDocumentos((prev) => [data, ...prev]);
        setUploads((prev) =>
          prev.map((u) => (u.name === file.name ? { ...u, status: "done" } : u)),
        );

        if (file.name.toLowerCase().endsWith(".pdf")) {
          fetch(`/api/licitaciones/${licitacionId}/procesar-documento`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ documento_id: data.id }),
          }).catch(() => {
            toast.error(`No se pudo iniciar el procesamiento de "${file.name}"`);
          });
        }
      }

      setTimeout(() => setUploads([]), 2000);
    },
    [licitacionId, organizationId],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED,
    maxSize: MAX_SIZE,
    onDropRejected: (rejections) => {
      for (const r of rejections) {
        toast.error(`"${r.file.name}" no es válido`, {
          description: r.errors.map((e) => e.message).join(", "),
        });
      }
    },
  });

  async function handleDelete(doc: Documento) {
    const supabase = createClient();
    await supabase.storage.from(BUCKET).remove([doc.storage_path]);
    const { error } = await supabase.from("documentos").delete().eq("id", doc.id);
    if (error) {
      toast.error("No se pudo eliminar el documento", { description: error.message });
      return;
    }
    setDocumentos((prev) => prev.filter((d) => d.id !== doc.id));
    toast.success("Documento eliminado");
  }

  async function handleOpen(doc: Documento) {
    const supabase = createClient();
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(doc.storage_path, 60 * 10, { download: false });

    if (error || !data) {
      toast.error("No se pudo abrir el documento", { description: error?.message });
      return;
    }

    if (doc.nombre.toLowerCase().endsWith(".pdf")) {
      setViewerDoc(doc);
      setViewerUrl(data.signedUrl);
    } else {
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    }
  }

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
        />
      </div>

      <div className="flex flex-col gap-3">
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
          <input {...getInputProps()} />
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
                    <Button variant="ghost" size="icon-sm" onClick={() => setFirmandoDoc(doc.id)}>
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
          documentoId={firmandoDoc}
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
