"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import Image from "@tiptap/extension-image";
import { toast } from "sonner";
import {
  Bold,
  Italic,
  Image as ImageIcon,
  List,
  ListOrdered,
  Sparkles,
  Table as TableIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface Seccion {
  id: string;
  titulo: string;
  html: string;
  origen: "ia" | "editado";
}

interface Propuesta {
  id: string;
  version: number;
  nombre_version: string | null;
  contenido_json: { secciones: Seccion[] };
}

export function PropuestaTecnicaTab({ licitacionId }: { licitacionId: string }) {
  const [propuesta, setPropuesta] = useState<Propuesta | null | undefined>(undefined);
  const [secciones, setSecciones] = useState<Seccion[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);
  const [mejorando, setMejorando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [nombreVersion, setNombreVersion] = useState("");
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => {
    fetch(`/api/licitaciones/${licitacionId}/propuesta-tecnica`)
      .then((res) => res.json())
      .then((json) => {
        const data = json.data as Propuesta | null;
        setPropuesta(data ?? null);
        const secs = data?.contenido_json?.secciones ?? [];
        setSecciones(secs);
        setActiveId(secs[0]?.id ?? null);
      });
  }, [licitacionId]);

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
    const completas = secciones.filter((s) => s.html && s.html.replace(/<[^>]+>/g, "").trim().length > 20);
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
      toast.error("No se pudo generar la propuesta técnica", { description: json.error });
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

  if (propuesta === undefined) {
    return <Skeleton className="h-96 w-full" />;
  }

  if (!propuesta) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            Aún no se ha generado la propuesta técnica.
          </p>
          <Button onClick={handleGenerar} disabled={generando}>
            <Sparkles />
            {generando ? "Generando…" : "Generar propuesta técnica con IA"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const activeSeccion = secciones.find((s) => s.id === activeId);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="outline" onClick={handleGenerar} disabled={generando}>
          <Sparkles />
          {generando ? "Regenerando…" : "Regenerar todo con IA"}
        </Button>
        <Button variant="outline" onClick={handleExportar} disabled={exportando}>
          {exportando ? "Exportando…" : "Exportar como DOCX"}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_1fr_240px]">
        <Card className="h-fit lg:sticky lg:top-4">
          <CardContent className="flex flex-col gap-1 pt-4">
            {secciones.map((s) => (
              <button
                key={s.id}
                onClick={() => setActiveId(s.id)}
                className={cn(
                  "flex items-center justify-between rounded-md px-2 py-1.5 text-left text-sm",
                  s.id === activeId ? "bg-primary/10 text-primary" : "hover:bg-muted",
                )}
              >
                <span className="truncate">{s.titulo}</span>
                <span
                  className={cn(
                    "ml-1 shrink-0 rounded-full px-1.5 text-[10px]",
                    s.origen === "editado"
                      ? "bg-secondary text-secondary-foreground"
                      : "bg-accent text-accent-foreground",
                  )}
                >
                  {s.origen === "editado" ? "Editado" : "IA"}
                </span>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-2 pt-4">
            <div className="flex flex-wrap items-center gap-1 border-b pb-2">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => editor?.chain().focus().toggleBold().run()}
              >
                <Bold />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => editor?.chain().focus().toggleItalic().run()}
              >
                <Italic />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => editor?.chain().focus().toggleBulletList().run()}
              >
                <List />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => editor?.chain().focus().toggleOrderedList().run()}
              >
                <ListOrdered />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() =>
                  editor?.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run()
                }
              >
                <TableIcon />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => {
                  const url = window.prompt("URL de la imagen");
                  if (url) editor?.chain().focus().setImage({ src: url }).run();
                }}
              >
                <ImageIcon />
              </Button>
              <div className="ml-auto">
                <Button variant="outline" size="sm" onClick={handleMejorar} disabled={mejorando}>
                  <Sparkles className="size-3.5" />
                  {mejorando ? "Mejorando…" : "Mejorar sección con IA"}
                </Button>
              </div>
            </div>
            <EditorContent
              editor={editor}
              className="prose prose-sm max-w-none [&_.ProseMirror]:min-h-96 [&_.ProseMirror]:outline-none"
            />
          </CardContent>
        </Card>

        <Card className="h-fit lg:sticky lg:top-4">
          <CardContent className="flex flex-col gap-3 pt-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Sección actual</p>
              <p className="font-medium">{activeSeccion?.titulo ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Progreso</p>
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-primary" style={{ width: `${porcentajeCompleto}%` }} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{porcentajeCompleto}% completo</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <p className="text-xs text-muted-foreground">Versión actual: {propuesta.version}</p>
              <Input
                placeholder="Nombre de la versión"
                value={nombreVersion}
                onChange={(e) => setNombreVersion(e.target.value)}
              />
              <Button size="sm" variant="outline" onClick={handleGuardarVersion}>
                Guardar versión
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
