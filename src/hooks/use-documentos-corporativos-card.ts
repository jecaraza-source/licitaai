"use client";

import { useCallback, useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { sanitizeFilename } from "@/lib/utils";
import { TIPOS_DOCUMENTO_CORPORATIVO } from "@/lib/documentos-corporativos";
import type { DocumentoCorporativo } from "@/types";

export function useDocumentosCorporativosCard(empresaId: string) {
  const [documentos, setDocumentos] = useState<DocumentoCorporativo[] | null>(null);
  const [noAplican, setNoAplican] = useState<string[]>([]);
  const [tipoSeleccionado, setTipoSeleccionado] = useState(TIPOS_DOCUMENTO_CORPORATIVO[0]);
  const [subiendo, setSubiendo] = useState(false);
  const [analizandoIds, setAnalizandoIds] = useState<string[]>([]);
  const [fechasManuales, setFechasManuales] = useState<Record<string, string>>({});

  // P1.5 — `cargar` estable (useCallback) para poder listarla como
  // dependencia de los efectos/callbacks que la usan, en vez de silenciar
  // exhaustive-deps.
  const cargar = useCallback(() => {
    fetch(`/api/empresa-perfil/${empresaId}/documentos`)
      .then((res) => res.json())
      .then((json) => setDocumentos(json.data ?? []));
    fetch(`/api/empresa-perfil/${empresaId}`)
      .then((res) => res.json())
      .then((json) => setNoAplican(json.data?.documentos_no_aplican ?? []));
  }, [empresaId]);

  async function toggleNoAplica(tipo: string, no_aplica: boolean) {
    setNoAplican((prev) => (no_aplica ? [...prev, tipo] : prev.filter((t) => t !== tipo)));
    const res = await fetch(`/api/empresa-perfil/${empresaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo, no_aplica }),
    });
    if (!res.ok) {
      toast.error("No se pudo actualizar");
      cargar();
    }
  }

  useEffect(() => {
    cargar();
  }, [cargar]);

  const analizarVigencia = useCallback(
    async (docId: string, fechaEmisionManual?: string) => {
      setAnalizandoIds((prev) => [...prev, docId]);
      try {
        const res = await fetch(`/api/empresa-perfil/${empresaId}/documentos/${docId}/analizar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fecha_emision_manual: fechaEmisionManual ?? null }),
        });
        if (!res.ok) {
          toast.error("No se pudo calcular la vigencia", {
            description: fechaEmisionManual
              ? undefined
              : "No se detectó la fecha de emisión automáticamente. Captúrala manualmente.",
          });
          return;
        }
        const json = await res.json().catch(() => null);
        if (!fechaEmisionManual && json?.data?.coincide_empresa === false) {
          toast.warning("El documento no coincide con la empresa activa", {
            description:
              json?.data?.motivo_no_coincide ??
              "El RFC o razón social detectados no corresponden a esta empresa. Verifícalo.",
          });
        }
        if (!fechaEmisionManual) {
          const camposExtraidos = Object.keys(json?.data?.datos_extraidos_json ?? {});
          if (camposExtraidos.length > 0) {
            toast.success(`Se extrajeron ${camposExtraidos.length} dato(s) legales del documento`, {
              description: 'Revísalos y aplícalos en "Datos legales" con el botón de prellenado.',
            });
          }
        }
        cargar();
      } catch {
        toast.error("No se pudo calcular la vigencia", { description: "Error de red inesperado" });
      } finally {
        setAnalizandoIds((prev) => prev.filter((id) => id !== docId));
      }
    },
    [empresaId, cargar],
  );

  const subirDocumento = useCallback(
    async (file: File) => {
      setSubiendo(true);
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data: perfil } = await supabase
        .from("users")
        .select("organization_id")
        .eq("id", user?.id ?? "")
        .single();

      const path = `${perfil?.organization_id}/${Date.now()}-${sanitizeFilename(file.name)}`;
      const { error: uploadError } = await supabase.storage
        .from("documentos-corporativos")
        .upload(path, file);

      if (uploadError) {
        setSubiendo(false);
        toast.error("No se pudo subir el documento", { description: uploadError.message });
        return;
      }

      const res = await fetch(`/api/empresa-perfil/${empresaId}/documentos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: tipoSeleccionado, nombre: file.name, storage_path: path }),
      });
      const json = await res.json().catch(() => null);
      setSubiendo(false);

      if (!res.ok || !json?.data?.id) {
        await supabase.storage.from("documentos-corporativos").remove([path]);
        toast.error("No se pudo registrar el documento");
        return;
      }
      toast.success(`"${tipoSeleccionado}" guardado`);
      cargar();
      analizarVigencia(json.data.id);
    },
    [empresaId, tipoSeleccionado, analizarVigencia, cargar],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { "application/pdf": [".pdf"], "image/jpeg": [".jpg", ".jpeg"], "image/png": [".png"] },
    maxFiles: 1,
    onDrop: ([file]) => {
      if (file) subirDocumento(file);
    },
  });

  async function eliminar(doc: DocumentoCorporativo) {
    setDocumentos((prev) => (prev ? prev.filter((d) => d.id !== doc.id) : prev));
    await fetch(`/api/empresa-perfil/${empresaId}/documentos/${doc.id}`, { method: "DELETE" });
  }

  return {
    documentos,
    noAplican,
    tipoSeleccionado,
    setTipoSeleccionado,
    subiendo,
    analizandoIds,
    fechasManuales,
    setFechasManuales,
    toggleNoAplica,
    analizarVigencia,
    eliminar,
    getRootProps,
    getInputProps,
    isDragActive,
  };
}
