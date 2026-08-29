"use client";

import { EditorContent } from "@tiptap/react";
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
import { RequisitosTecnicosCard } from "@/components/licitaciones/requisitos-tecnicos-card";
import { RevisorPropuestaCard } from "@/components/licitaciones/revisor-propuesta-card";
import { cn } from "@/lib/utils";
import { usePropuestaTecnicaTab } from "@/hooks/use-propuesta-tecnica-tab";

export function PropuestaTecnicaTab({ licitacionId }: { licitacionId: string }) {
  const {
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
  } = usePropuestaTecnicaTab(licitacionId);

  if (propuesta === undefined) {
    return <Skeleton className="h-96 w-full" />;
  }

  if (!propuesta) {
    return (
      <div className="flex flex-col gap-4">
        <RequisitosTecnicosCard licitacionId={licitacionId} />
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
      </div>
    );
  }

  const activeSeccion = secciones.find((s) => s.id === activeId);

  return (
    <div className="flex flex-col gap-4">
      <RequisitosTecnicosCard licitacionId={licitacionId} />
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

        <div className="flex flex-col gap-4">
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

        <RevisorPropuestaCard
          licitacionId={licitacionId}
          createdBy={propuesta.created_by}
          revisorId={propuesta.revisor_id}
          revisadoAt={propuesta.revisado_at}
          onUpdated={cargarPropuesta}
        />
        </div>
      </div>
    </div>
  );
}
