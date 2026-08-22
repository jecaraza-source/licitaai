"use client";

import { useCallback, useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import { FileText, Trash2, UploadCloud } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { PdfViewer } from "@/components/licitaciones/pdf-viewer";
import type { Documento } from "@/types";

const ACCEPTED = {
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
};

const MAX_SIZE = 50 * 1024 * 1024;
const BUCKET = "documentos-originales";

function sanitizeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
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
}: {
  licitacionId: string;
  organizationId: string;
  initialDocumentos: Documento[];
}) {
  const [documentos, setDocumentos] = useState<Documento[]>(initialDocumentos);
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const [viewerDoc, setViewerDoc] = useState<Documento | null>(null);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);

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
    <div className="flex flex-col gap-4">
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
                    <p className="truncate text-sm font-medium hover:underline">{doc.nombre}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatBytes(doc.tamanio_bytes)} ·{" "}
                      {doc.procesado ? "Procesado" : "Sin procesar"}
                    </p>
                  </button>
                  <Button variant="ghost" size="icon-sm" onClick={() => handleDelete(doc)}>
                    <Trash2 className="text-destructive" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

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
