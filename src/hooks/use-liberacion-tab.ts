"use client";

import { useCallback, useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { sanitizeFilename } from "@/lib/utils";
import type { ChecklistLiberacionItem, EvidenciaEnvio } from "@/types";

export interface GateStatus {
  rojos: number;
  amarillosCriticos: number;
  pendientesLiberacion: number;
  itemsLiberacion: ChecklistLiberacionItem[];
  jerarquiaAutorizada: boolean;
  analisisIaSinRevisar: { id: string; tipo_analisis: string; documento_id: string | null }[];
  gateAprobacionIaActivo: boolean;
  bloqueado: boolean;
}

export function useLiberacionTab(licitacionId: string) {
  const [gate, setGate] = useState<GateStatus | null>(null);

  const cargar = useCallback(() => {
    fetch(`/api/licitaciones/${licitacionId}/liberacion`)
      .then((res) => res.json())
      .then((json) => setGate(json.data));
  }, [licitacionId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

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

  return { gate, cargar, toggleItem };
}

export function useEvidenciaEnvioCard(licitacionId: string, organizationId: string) {
  const [evidencias, setEvidencias] = useState<EvidenciaEnvio[] | null>(null);
  const [notas, setNotas] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const [archivo, setArchivo] = useState<{ id: string; nombre: string } | null>(null);

  const cargarEvidencias = useCallback(() => {
    fetch(`/api/licitaciones/${licitacionId}/evidencia-envio`)
      .then((res) => res.json())
      .then((json) => setEvidencias(json.data ?? []));
  }, [licitacionId]);

  useEffect(() => {
    cargarEvidencias();
  }, [cargarEvidencias]);

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
        await supabase.storage.from("documentos-originales").remove([path]);
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

  return {
    evidencias,
    notas,
    setNotas,
    subiendo,
    archivo,
    getRootProps,
    getInputProps,
    isDragActive,
    registrar,
  };
}
