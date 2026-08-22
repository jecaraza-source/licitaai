"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useDropzone } from "react-dropzone";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Sparkles, Trash2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn, sanitizeFilename } from "@/lib/utils";

interface Pregunta {
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

interface Respuesta {
  pregunta_id: string | null;
  pregunta_texto: string;
  respuesta: string;
}

interface Junta {
  id: string;
  preguntas_json: Pregunta[];
  respuestas_json: Respuesta[];
  estado: "BORRADOR" | "ENVIADA" | "RESPONDIDA";
}

const CATEGORIA_LABELS: Record<Pregunta["categoria"], string> = {
  TECNICAS: "Técnica",
  ADMINISTRATIVAS: "Administrativa",
  ECONOMICAS: "Económica",
  JURIDICAS: "Jurídica",
};

const PRIORIDAD_STYLES: Record<Pregunta["prioridad"], string> = {
  ALTA: "bg-destructive/10 text-destructive",
  MEDIA: "bg-accent text-accent-foreground",
  BAJA: "bg-muted text-muted-foreground",
};

function SortablePregunta({
  pregunta,
  index,
  respuesta,
  onChange,
  onDelete,
}: {
  pregunta: Pregunta;
  index: number;
  respuesta?: Respuesta;
  onChange: (id: string, patch: Partial<Pregunta>) => void;
  onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: pregunta.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex flex-col gap-2 rounded-lg border p-3",
        isDragging && "opacity-50",
      )}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="mt-1 cursor-grab text-muted-foreground active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </button>
        <Checkbox
          checked={pregunta.incluida ?? true}
          onCheckedChange={(checked) => onChange(pregunta.id, { incluida: checked === true })}
          className="mt-1.5"
        />
        <div className="flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">#{index + 1}</span>
            <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
              {CATEGORIA_LABELS[pregunta.categoria]}
            </span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs",
                PRIORIDAD_STYLES[pregunta.prioridad],
              )}
            >
              {pregunta.prioridad}
            </span>
            {pregunta.origen === "manual" && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                Manual
              </span>
            )}
          </div>
          <Textarea
            value={pregunta.texto}
            onChange={(e) => onChange(pregunta.id, { texto: e.target.value })}
            className="min-h-14 resize-none"
          />
          {pregunta.fundamento_legal && (
            <p className="mt-1 text-xs text-muted-foreground">{pregunta.fundamento_legal}</p>
          )}
          {respuesta && (
            <div className="mt-2 rounded-md bg-muted/60 p-2 text-sm">
              <p className="text-xs font-medium text-muted-foreground">Respuesta:</p>
              <p>{respuesta.respuesta}</p>
            </div>
          )}
        </div>
        <Button variant="ghost" size="icon-sm" onClick={() => onDelete(pregunta.id)}>
          <Trash2 className="text-destructive" />
        </Button>
      </div>
    </div>
  );
}

export function JuntaAclaracionesTab({ licitacionId }: { licitacionId: string }) {
  const [junta, setJunta] = useState<Junta | null | undefined>(undefined);
  const [preguntas, setPreguntas] = useState<Pregunta[]>([]);
  const [generando, setGenerando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [subiendoActa, setSubiendoActa] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

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
      toast.error("No se pudieron generar las preguntas", { description: json.error });
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
        toast.error("No se pudieron extraer las respuestas", { description: json.error });
        return;
      }

      setJunta(json.data);
      toast.success("Respuestas extraídas del acta");
    },
  });

  if (junta === undefined) {
    return <Skeleton className="h-64 w-full" />;
  }

  const respuestaPorPregunta = new Map(
    (junta?.respuestas_json ?? []).map((r) => [r.pregunta_id, r]),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button onClick={handleGenerar} disabled={generando}>
          <Sparkles />
          {generando ? "Generando…" : "Generar preguntas con IA"}
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onAgregarManual}>
            <Plus /> Agregar pregunta
          </Button>
          <Button
            variant="outline"
            onClick={handleExportar}
            disabled={exportando || preguntas.length === 0}
          >
            {exportando ? "Exportando…" : "Exportar a Word"}
          </Button>
        </div>
      </div>

      {preguntas.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Aún no hay preguntas. Genera con IA o agrega una manualmente.
          </CardContent>
        </Card>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={preguntas.map((p) => p.id)} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-2">
              {preguntas.map((p, i) => (
                <SortablePregunta
                  key={p.id}
                  pregunta={p}
                  index={i}
                  respuesta={respuestaPorPregunta.get(p.id)}
                  onChange={onChangePregunta}
                  onDelete={onDeletePregunta}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {preguntas.length > 0 && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => handleGuardar(preguntas)} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar cambios"}
          </Button>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Respuestas — cargar acta de la junta</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            {...getRootProps()}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors",
              isDragActive ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40",
            )}
          >
            <input {...getInputProps()} />
            <UploadCloud className="size-6 text-muted-foreground" />
            <p className="text-sm">
              {subiendoActa
                ? "Procesando acta…"
                : "Arrastra el acta de junta (PDF) para extraer las respuestas"}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
