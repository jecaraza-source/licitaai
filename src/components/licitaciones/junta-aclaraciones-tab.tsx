"use client";

import {
  DndContext,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Printer, Sparkles, Trash2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { VincularAclaracionDialog } from "@/components/licitaciones/vincular-aclaracion-dialog";
import { useJuntaAclaracionesTab, type Pregunta, type Respuesta } from "@/hooks/use-junta-aclaraciones-tab";

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
  ocultarAlImprimir,
  onChange,
  onDelete,
}: {
  pregunta: Pregunta;
  index: number;
  respuesta?: Respuesta;
  ocultarAlImprimir: boolean;
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
        ocultarAlImprimir && "print:hidden",
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
  const {
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
  } = useJuntaAclaracionesTab(licitacionId);

  if (junta === undefined) {
    return <Skeleton className="h-64 w-full" />;
  }

  const respuestaPorPregunta = new Map(
    (junta?.respuestas_json ?? []).map((r) => [r.pregunta_id, r]),
  );

  return (
    <div className="flex flex-col gap-4" id="junta-aclaraciones-printable">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Button onClick={handleGenerar} disabled={generando}>
          <Sparkles />
          {generando ? "Generando…" : "Generar preguntas con IA"}
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onAgregarManual}>
            <Plus /> Agregar pregunta
          </Button>
          <Select value={filtroImpresion} onValueChange={(v) => v && setFiltroImpresion(v as typeof filtroImpresion)}>
            <SelectTrigger size="sm" className="w-56">
              <SelectValue>
                {() =>
                  filtroImpresion === "decididas"
                    ? "Imprimir: solo con respuesta"
                    : "Imprimir: todas las preguntas"
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas las preguntas</SelectItem>
              <SelectItem value="decididas">Solo con respuesta (decididas)</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => window.print()} disabled={preguntas.length === 0}>
            <Printer /> Imprimir
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

      <div className="hidden print:block">
        {empresaNombre && <p className="text-lg font-bold">{empresaNombre}</p>}
        <h2 className="text-xl font-semibold">Preguntas para la Junta de Aclaraciones</h2>
        {filtroImpresion === "decididas" && (
          <p className="text-sm text-muted-foreground">Solo preguntas con respuesta vinculada</p>
        )}
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
                  ocultarAlImprimir={filtroImpresion === "decididas" && !respuestaPorPregunta.has(p.id)}
                  onChange={onChangePregunta}
                  onDelete={onDeletePregunta}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {preguntas.length > 0 && (
        <div className="flex justify-end print:hidden">
          <Button variant="outline" size="sm" onClick={() => handleGuardar(preguntas)} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar cambios"}
          </Button>
        </div>
      )}

      <Card className="print:hidden">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>Respuestas — cargar acta de la junta</CardTitle>
          {junta && <VincularAclaracionDialog licitacionId={licitacionId} />}
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
