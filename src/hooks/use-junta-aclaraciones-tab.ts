"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useDropzone } from "react-dropzone";
import {
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { sanitizeFilename } from "@/lib/utils";
import type { EmpresaPerfil } from "@/types";

export interface Pregunta {
  id: string;
  orden: number;
  origen: "ia" | "manual";
  texto: string;
  categoria: "TECNICAS" | "ADMINISTRATIVAS" | "ECONOMICAS" | "JURIDICAS";
  fundamento_legal: string | null;
  prioridad: "ALTA" | "MEDIA" | "BAJA";
  justificacion?: string;
  incluida?: boolean;
}

export interface Respuesta {
  pregunta_id: string | null;
  pregunta_texto: string;
  respuesta: string;
}

export interface Junta {
  id: string;
  preguntas_json: Pregunta[];
  respuestas_json: Respuesta[];
  estado: "BORRADOR" | "ENVIADA" | "RESPONDIDA";
}

export function useJuntaAclaracionesTab(licitacionId: string) {
  const [junta, setJunta] = useState<Junta | null | undefined>(undefined);
  const [preguntas, setPreguntas] = useState<Pregunta[]>([]);
  const [generando, setGenerando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [subiendoActa, setSubiendoActa] = useState(false);
  const [filtroImpresion, setFiltroImpresion] = useState<"todas" | "decididas">("todas");
  const [empresaNombre, setEmpresaNombre] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  useEffect(() => {
    fetch("/api/empresa-perfil")
      .then((res) => res.json())
      .then((json) => {
        const data = (json.data?.data as EmpresaPerfil[]) ?? [];
        const activaId = (json.data?.activaId as string | null) ?? null;
        const activa = data.find((e) => e.id === activaId) ?? data[0] ?? null;
        setEmpresaNombre(activa?.razon_social?.trim() || null);
      });
  }, []);

  useEffect(() => {
    fetch(`/api/licitaciones/${licitacionId}/junta-aclaraciones`)
      .then((res) => res.json())
      .then((json) => {
        setJunta(json.data ?? null);
        setPreguntas(json.data?.preguntas_json ?? []);
      });
  }, [licitacionId]);

  async function handleGenerar() {
    setGenerando(true);
    const res = await fetch(`/api/licitaciones/${licitacionId}/junta-aclaraciones/generar`, {
      method: "POST",
    });
    const json = await res.json();
    setGenerando(false);

    if (!res.ok) {
      toast.error("No se pudieron generar las preguntas", { description: json.error?.message ?? json.error });
      return;
    }

    setJunta(json.data);
    setPreguntas(json.data.preguntas_json ?? []);
    toast.success("Preguntas generadas");
  }

  async function handleGuardar(nuevasPreguntas: Pregunta[]) {
    setGuardando(true);
    const res = await fetch(`/api/licitaciones/${licitacionId}/junta-aclaraciones`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preguntas_json: nuevasPreguntas }),
    });
    setGuardando(false);
    if (!res.ok) {
      toast.error("No se pudieron guardar los cambios");
    }
  }

  function onChangePregunta(id: string, patch: Partial<Pregunta>) {
    setPreguntas((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, ...patch } : p));
      return next;
    });
  }

  function onDeletePregunta(id: string) {
    setPreguntas((prev) => {
      const next = prev.filter((p) => p.id !== id);
      handleGuardar(next);
      return next;
    });
  }

  function onAgregarManual() {
    setPreguntas((prev) => {
      const next = [
        ...prev,
        {
          id: crypto.randomUUID(),
          orden: prev.length,
          origen: "manual" as const,
          texto: "",
          categoria: "TECNICAS" as const,
          fundamento_legal: null,
          prioridad: "MEDIA" as const,
          incluida: true,
        },
      ];
      return next;
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setPreguntas((prev) => {
      const oldIndex = prev.findIndex((p) => p.id === active.id);
      const newIndex = prev.findIndex((p) => p.id === over.id);
      const next = arrayMove(prev, oldIndex, newIndex).map((p, i) => ({ ...p, orden: i }));
      handleGuardar(next);
      return next;
    });
  }

  async function handleExportar() {
    setExportando(true);
    const res = await fetch(`/api/licitaciones/${licitacionId}/junta-aclaraciones/exportar`, {
      method: "POST",
    });
    setExportando(false);
    if (!res.ok) {
      toast.error("No se pudo exportar el documento");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "junta-aclaraciones.docx";
    a.click();
    URL.revokeObjectURL(url);
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { "application/pdf": [".pdf"] },
    maxFiles: 1,
    onDrop: async ([file]) => {
      if (!file) return;
      setSubiendoActa(true);

      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data: perfil } = await supabase
        .from("users")
        .select("organization_id")
        .eq("id", user?.id ?? "")
        .single();

      const path = `${perfil?.organization_id}/${licitacionId}/${Date.now()}-${sanitizeFilename(file.name)}`;
      const { error: uploadError } = await supabase.storage
        .from("documentos-originales")
        .upload(path, file);

      if (uploadError) {
        setSubiendoActa(false);
        toast.error("No se pudo subir el acta", { description: uploadError.message });
        return;
      }

      const { data: doc, error: insertError } = await supabase
        .from("documentos")
        .insert({
          licitacion_id: licitacionId,
          tipo_documento: "ACTA_JUNTA",
          nombre: file.name,
          storage_path: path,
          tamanio_bytes: file.size,
        })
        .select()
        .single();

      if (insertError || !doc) {
        setSubiendoActa(false);
        await supabase.storage.from("documentos-originales").remove([path]);
        toast.error("No se pudo registrar el acta");
        return;
      }

      const res = await fetch(`/api/licitaciones/${licitacionId}/junta-aclaraciones/respuestas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documento_id: doc.id }),
      });
      const json = await res.json();
      setSubiendoActa(false);

      if (!res.ok) {
        toast.error("No se pudieron extraer las respuestas", { description: json.error?.message ?? json.error });
        return;
      }

      setJunta(json.data);
      toast.success("Respuestas extraídas del acta");
    },
  });

  return {
    junta,
    preguntas,
    generando,
    guardando,
    exportando,
    subiendoActa,
    filtroImpresion,
    setFiltroImpresion,
    empresaNombre,
    sensors,
    handleGenerar,
    handleGuardar,
    onChangePregunta,
    onDeletePregunta,
    onAgregarManual,
    handleDragEnd,
    handleExportar,
    getRootProps,
    getInputProps,
    isDragActive,
  };
}
