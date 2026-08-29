"use client";

import { useCallback, useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { sanitizeFilename } from "@/lib/utils";

export interface Seguimiento {
  id: string;
  resultado_json: {
    empresa_ganadora?: string | null;
    precio_ganador?: number | null;
    nuestra_posicion?: string | null;
    motivos_descalificacion?: string | null;
    diferencia_precio_porcentaje?: number | null;
  };
  lecciones_aprendidas: string | null;
  tags_json: string[];
  contrato_documento_id: string | null;
  garantia_documento_id: string | null;
  fianza_documento_id: string | null;
  vigencia_inicio: string | null;
  vigencia_fin: string | null;
  administrador_contrato_id: string | null;
  orden_suministro: string | null;
  lugar_entrega: string | null;
  penalizaciones: string | null;
  niveles_servicio: string | null;
}

export const DOC_CONTRACTUAL_LABELS: Record<string, string> = {
  contrato_documento_id: "Contrato",
  garantia_documento_id: "Garantía",
  fianza_documento_id: "Fianza",
};

export function useSeguimientoTab(licitacionId: string, organizationId: string) {
  const [seguimiento, setSeguimiento] = useState<Seguimiento | null | undefined>(undefined);
  const [lecciones, setLecciones] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [nuevoTag, setNuevoTag] = useState("");
  const [analizando, setAnalizando] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(() => {
    fetch(`/api/licitaciones/${licitacionId}/seguimiento`)
      .then((res) => res.json())
      .then((json) => {
        setSeguimiento(json.data ?? null);
        setLecciones(json.data?.lecciones_aprendidas ?? "");
        setTags(json.data?.tags_json ?? []);
      });
  }, [licitacionId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { "application/pdf": [".pdf"] },
    maxFiles: 1,
    onDrop: async ([file]) => {
      if (!file) return;
      setAnalizando(true);
      const supabase = createClient();
      const path = `${organizationId}/${licitacionId}/${Date.now()}-${sanitizeFilename(file.name)}`;
      const { error: uploadError } = await supabase.storage
        .from("documentos-originales")
        .upload(path, file);
      if (uploadError) {
        setAnalizando(false);
        toast.error("No se pudo subir el acta");
        return;
      }
      const { data: doc, error: insertError } = await supabase
        .from("documentos")
        .insert({
          licitacion_id: licitacionId,
          tipo_documento: "ACTA_FALLO",
          nombre: file.name,
          storage_path: path,
          tamanio_bytes: file.size,
        })
        .select()
        .single();
      if (insertError || !doc) {
        setAnalizando(false);
        await supabase.storage.from("documentos-originales").remove([path]);
        toast.error("No se pudo registrar el acta");
        return;
      }

      const res = await fetch(`/api/licitaciones/${licitacionId}/seguimiento/analizar-fallo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documento_id: doc.id }),
      });
      setAnalizando(false);
      if (!res.ok) {
        toast.error("No se pudo analizar el acta de fallo");
        return;
      }
      toast.success("Acta de fallo analizada");
      cargar();
    },
  });

  async function handleGuardarLecciones() {
    setGuardando(true);
    const res = await fetch(`/api/licitaciones/${licitacionId}/seguimiento`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lecciones_aprendidas: lecciones, tags_json: tags }),
    });
    setGuardando(false);
    if (!res.ok) {
      toast.error("No se pudo guardar");
      return;
    }
    toast.success("Lecciones aprendidas guardadas");
  }

  return {
    seguimiento,
    cargar,
    lecciones,
    setLecciones,
    tags,
    setTags,
    nuevoTag,
    setNuevoTag,
    analizando,
    guardando,
    getRootProps,
    getInputProps,
    isDragActive,
    handleGuardarLecciones,
  };
}

export function useFormalizacionCard(
  licitacionId: string,
  organizationId: string,
  seguimiento: Seguimiento | null,
  onUpdated: () => void,
) {
  const [usuarios, setUsuarios] = useState<{ id: string; nombre: string }[]>([]);
  const [campos, setCampos] = useState({
    vigencia_inicio: seguimiento?.vigencia_inicio ?? "",
    vigencia_fin: seguimiento?.vigencia_fin ?? "",
    orden_suministro: seguimiento?.orden_suministro ?? "",
    lugar_entrega: seguimiento?.lugar_entrega ?? "",
    penalizaciones: seguimiento?.penalizaciones ?? "",
    niveles_servicio: seguimiento?.niveles_servicio ?? "",
  });
  const [subiendo, setSubiendo] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/organizacion/usuarios")
      .then((res) => res.json())
      .then((json) => setUsuarios(json.data ?? []));
  }, []);

  async function guardarCampo(campo: string, valor: string) {
    await fetch(`/api/licitaciones/${licitacionId}/seguimiento`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [campo]: valor || null }),
    });
  }

  const subirDocumento = useCallback(
    async (campo: string, file: File) => {
      setSubiendo(campo);
      const supabase = createClient();
      const sello = Date.now();
      const path = `${organizationId}/${licitacionId}/${sello}-${sanitizeFilename(file.name)}`;
      const { error: uploadError } = await supabase.storage
        .from("documentos-originales")
        .upload(path, file);

      if (uploadError) {
        setSubiendo(null);
        toast.error("No se pudo subir el archivo", { description: uploadError.message });
        return;
      }

      const { data: doc, error: insertError } = await supabase
        .from("documentos")
        .insert({
          licitacion_id: licitacionId,
          tipo_documento: campo.toUpperCase(),
          nombre: file.name,
          storage_path: path,
          tamanio_bytes: file.size,
        })
        .select()
        .single();

      if (insertError || !doc) {
        setSubiendo(null);
        await supabase.storage.from("documentos-originales").remove([path]);
        toast.error("No se pudo registrar el archivo");
        return;
      }

      const res = await fetch(`/api/licitaciones/${licitacionId}/seguimiento`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [campo]: doc.id }),
      });
      setSubiendo(null);
      if (!res.ok) {
        toast.error("No se pudo guardar la referencia del documento");
        return;
      }
      toast.success(`${DOC_CONTRACTUAL_LABELS[campo]} guardado`);
      onUpdated();
    },
    [licitacionId, organizationId, onUpdated],
  );

  return { usuarios, campos, setCampos, subiendo, guardarCampo, subirDocumento };
}
