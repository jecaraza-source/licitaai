"use client";

import { useCallback, useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { sanitizeFilename } from "@/lib/utils";
import { useRealtimeLista } from "@/hooks/use-realtime-lista";
import type { Documento, EstadoChecklistItem } from "@/types";

export interface RequisitoDocumento {
  id: string;
  nombre: string;
  auditoria_json: {
    valido: boolean;
    observaciones: string[];
    nivel_riesgo: EstadoChecklistItem;
  } | null;
}

export interface RequisitoChecklistItem {
  id: string;
  categoria: string;
  descripcion: string;
  critico: boolean;
  estado: EstadoChecklistItem;
  documento_id: string | null;
  documentos: RequisitoDocumento | null;
}

export const DOCUMENTOS_CONVOCANTE = [
  { tipo: "SOLICITUD_ESTUDIO_MERCADO", label: "Solicitud de Estudio de Mercado" },
  { tipo: "INVITACION_PARTICIPAR", label: "Invitación a Participar" },
];

export const ACCEPTED = {
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
};

export const MAX_SIZE = 50 * 1024 * 1024;
export const BUCKET = "documentos-originales";

export function useRequisitoRow(
  item: RequisitoChecklistItem,
  licitacionId: string,
  organizationId: string,
  onUpdated: () => void,
) {
  const [analizando, setAnalizando] = useState(false);
  const [quitando, setQuitando] = useState(false);

  async function toggleNoAplica(noAplica: boolean) {
    const res = await fetch(`/api/checklist-items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado: noAplica ? "GRIS" : "AMARILLO" }),
    });
    if (!res.ok) {
      toast.error("No se pudo actualizar");
      return;
    }
    onUpdated();
  }

  async function quitarDocumento() {
    if (!item.documento_id) return;
    setQuitando(true);
    const supabase = createClient();
    const { data: doc } = await supabase
      .from("documentos")
      .select("storage_path")
      .eq("id", item.documento_id)
      .single();

    if (doc?.storage_path) {
      await supabase.storage.from("documentos-requeridos").remove([doc.storage_path]);
    }
    await supabase.from("documentos").delete().eq("id", item.documento_id);

    const res = await fetch(`/api/checklist-items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documento_id: null, estado: "AMARILLO" }),
    });
    setQuitando(false);

    if (!res.ok) {
      toast.error("No se pudo quitar el documento");
      return;
    }
    toast.success(`Documento de "${item.descripcion}" eliminado`);
    onUpdated();
  }

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
        await supabase.storage.from("documentos-requeridos").remove([path]);
        toast.error("No se pudo registrar el documento");
        return;
      }

      if (file.name.toLowerCase().endsWith(".pdf")) {
        fetch(`/api/licitaciones/${licitacionId}/procesar-documento`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documento_id: doc.id }),
        }).catch(() => {});
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

  return { analizando, quitando, toggleNoAplica, quitarDocumento, getRootProps, getInputProps, isDragActive };
}

export function useDocumentosRequeridosCard(licitacionId: string) {
  const [checklist, setChecklist] = useState<RequisitoChecklistItem[] | null>(null);

  const cargar = useCallback(() => {
    fetch(`/api/licitaciones/${licitacionId}/auditoria`)
      .then((res) => res.json())
      .then((json) => setChecklist(json.data?.checklist ?? []));
  }, [licitacionId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return { checklist, cargar };
}

export function useDocumentoConvocanteRow(
  tipo: string,
  label: string,
  documento: Documento | undefined,
  licitacionId: string,
  organizationId: string,
) {
  const [subiendo, setSubiendo] = useState(false);
  const [quitando, setQuitando] = useState(false);

  async function quitarDocumento() {
    if (!documento) return;
    setQuitando(true);
    const supabase = createClient();
    await supabase.storage.from(BUCKET).remove([documento.storage_path]);
    const { error } = await supabase.from("documentos").delete().eq("id", documento.id);
    setQuitando(false);

    if (error) {
      toast.error("No se pudo quitar el documento", { description: error.message });
      return;
    }
    toast.success(`"${label}" eliminado`);
  }

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

      const { data: doc, error: insertError } = await supabase
        .from("documentos")
        .insert({
          licitacion_id: licitacionId,
          tipo_documento: tipo,
          nombre: file.name,
          storage_path: path,
          tamanio_bytes: file.size,
        })
        .select()
        .single();
      setSubiendo(false);

      if (insertError || !doc) {
        await supabase.storage.from(BUCKET).remove([path]);
        toast.error("No se pudo registrar el documento");
        return;
      }

      if (file.name.toLowerCase().endsWith(".pdf")) {
        fetch(`/api/licitaciones/${licitacionId}/procesar-documento`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documento_id: doc.id }),
        }).catch(() => {});
      }

      toast.success(`"${label}" guardado`);
    },
  });

  return { subiendo, quitando, quitarDocumento, getRootProps, getInputProps, isDragActive };
}

type UploadState = { name: string; status: "uploading" | "done" | "error" };

export function useDocumentosTab(
  licitacionId: string,
  organizationId: string,
  initialDocumentos: Documento[],
  initialDocumentosConvocanteNoAplica: string[],
) {
  // P1.5 — lista + suscripción Realtime en el hook compartido. Este
  // componente se desmonta/remonta al cambiar de pestaña, así que
  // `initialDocumentos` es una foto del primer render del servidor; el
  // hook la refresca al montar y mantiene el canal (con limpieza).
  const { items: documentos, setItems: setDocumentos } = useRealtimeLista<Documento>({
    tabla: "documentos",
    filtro: `licitacion_id=eq.${licitacionId}`,
    orden: { columna: "created_at" },
    inicial: initialDocumentos,
    alCambiar: (fila, evento) => {
      if (evento === "UPDATE" && fila.procesado) {
        toast.success(`"${fila.nombre}" terminó de procesarse`);
      }
    },
  });
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const [viewerDoc, setViewerDoc] = useState<Documento | null>(null);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [firmandoDoc, setFirmandoDoc] = useState<Documento | null>(null);
  const [convocanteNoAplican, setConvocanteNoAplican] = useState<string[]>(
    initialDocumentosConvocanteNoAplica,
  );

  const toggleConvocanteNoAplica = useCallback(
    async (tipo: string, noAplica: boolean) => {
      setConvocanteNoAplican((prev) =>
        noAplica ? [...new Set([...prev, tipo])] : prev.filter((t) => t !== tipo),
      );
      const res = await fetch(`/api/licitaciones/${licitacionId}/documentos-convocante-no-aplica`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, no_aplica: noAplica }),
      });
      if (!res.ok) {
        toast.error("No se pudo actualizar");
        setConvocanteNoAplican((prev) =>
          noAplica ? prev.filter((t) => t !== tipo) : [...new Set([...prev, tipo])],
        );
      }
    },
    [licitacionId],
  );

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
          await supabase.storage.from(BUCKET).remove([path]);
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
    [licitacionId, organizationId, setDocumentos],
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

  return {
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
  };
}
