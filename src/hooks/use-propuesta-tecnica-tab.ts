"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import Image from "@tiptap/extension-image";
import { toast } from "sonner";
import { soloTexto } from "@/lib/sanitize-html";

export interface Seccion {
  id: string;
  titulo: string;
  html: string;
  origen: "ia" | "editado";
}

export interface Propuesta {
  id: string;
  version: number;
  nombre_version: string | null;
  contenido_json: { secciones: Seccion[] };
  created_by: string | null;
  revisor_id: string | null;
  revisado_at: string | null;
}

export function usePropuestaTecnicaTab(licitacionId: string) {
  const [propuesta, setPropuesta] = useState<Propuesta | null | undefined>(undefined);
  const [secciones, setSecciones] = useState<Seccion[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);
  const [mejorando, setMejorando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [nombreVersion, setNombreVersion] = useState("");
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  function scheduleSave(next: Seccion[]) {
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      fetch(`/api/licitaciones/${licitacionId}/propuesta-tecnica`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contenido_json: { secciones: next } }),
      }).catch(() => {});
    }, 1200);
  }

  const editor = useEditor({
    extensions: [StarterKit, Table, TableRow, TableCell, TableHeader, Image],
    content: "",
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      if (!activeId) return;
      const html = editor.getHTML();
      setSecciones((prev) => {
        const next = prev.map((s) => (s.id === activeId ? { ...s, html, origen: "editado" as const } : s));
        scheduleSave(next);
        return next;
      });
    },
  });

  const cargarPropuesta = useCallback(() => {
    fetch(`/api/licitaciones/${licitacionId}/propuesta-tecnica`)
      .then((res) => res.json())
      .then((json) => {
        const data = json.data as Propuesta | null;
        setPropuesta(data ?? null);
        const secs = data?.contenido_json?.secciones ?? [];
        setSecciones(secs);
        setActiveId((prev) => prev ?? secs[0]?.id ?? null);
      });
  }, [licitacionId]);

  useEffect(() => {
    cargarPropuesta();
  }, [cargarPropuesta]);

  // Sincroniza el editor con la sección activa SOLO al cambiar de sección o
  // al montar el editor — deliberadamente NO cuando `secciones` cambia (eso
  // pasa en cada tecleo y volvería a setear el contenido, moviendo el
  // cursor). `secciones` fuera de deps es intencional.
  useEffect(() => {
    if (!editor || !activeId) return;
    const seccion = secciones.find((s) => s.id === activeId);
    if (seccion && editor.getHTML() !== seccion.html) {
      editor.commands.setContent(seccion.html || "<p></p>");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, editor]);

  const porcentajeCompleto = useMemo(() => {
    if (secciones.length === 0) return 0;
    const completas = secciones.filter((s) => s.html && soloTexto(s.html).length > 20);
    return Math.round((completas.length / secciones.length) * 100);
  }, [secciones]);

  async function handleGenerar() {
    setGenerando(true);
    const res = await fetch(`/api/licitaciones/${licitacionId}/propuesta-tecnica/generar`, {
      method: "POST",
    });
    const json = await res.json();
    setGenerando(false);

    if (!res.ok) {
      toast.error("No se pudo generar la propuesta técnica", { description: json.error?.message ?? json.error });
      return;
    }

    setPropuesta(json.data);
    const secs = json.data.contenido_json?.secciones ?? [];
    setSecciones(secs);
    setActiveId(secs[0]?.id ?? null);
    toast.success("Propuesta técnica generada");
  }

  async function handleMejorar() {
    if (!activeId || !editor) return;
    setMejorando(true);
    const res = await fetch(`/api/licitaciones/${licitacionId}/propuesta-tecnica/mejorar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html: editor.getHTML() }),
    });
    const json = await res.json();
    setMejorando(false);

    if (!res.ok) {
      toast.error("No se pudo mejorar la sección");
      return;
    }

    editor.commands.setContent(json.data.html);
    setSecciones((prev) => {
      const next = prev.map((s) => (s.id === activeId ? { ...s, html: json.data.html, origen: "editado" as const } : s));
      scheduleSave(next);
      return next;
    });
    toast.success("Sección mejorada con IA");
  }

  async function handleGuardarVersion() {
    const res = await fetch(`/api/licitaciones/${licitacionId}/propuesta-tecnica/version`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre_version: nombreVersion || undefined }),
    });
    if (!res.ok) {
      toast.error("No se pudo guardar la versión");
      return;
    }
    const json = await res.json();
    setPropuesta((prev) => (prev ? { ...prev, version: json.data.version } : prev));
    setNombreVersion("");
    toast.success(`Versión ${json.data.version} guardada`);
  }

  async function handleExportar() {
    setExportando(true);
    const res = await fetch(`/api/licitaciones/${licitacionId}/propuesta-tecnica/exportar`, {
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
    a.download = "propuesta-tecnica.docx";
    a.click();
    URL.revokeObjectURL(url);
  }

  return {
    propuesta,
    secciones,
    activeId,
    setActiveId,
    generando,
    mejorando,
    exportando,
    nombreVersion,
    setNombreVersion,
    editor,
    cargarPropuesta,
    porcentajeCompleto,
    handleGenerar,
    handleMejorar,
    handleGuardarVersion,
    handleExportar,
  };
}
