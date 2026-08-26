"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Info, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { AnalisisBases, FechasAnalisis, NivelConfianza } from "@/types";

const TODOS_LOS_DOCUMENTOS = "__todos__";

interface DocumentoProcesado {
  id: string;
  nombre: string;
}

const PROGRESS_STEPS = [
  "Buscando fragmentos relevantes en los documentos…",
  "Analizando objeto y montos…",
  "Extrayendo fechas del procedimiento…",
  "Identificando documentación requerida…",
  "Analizando criterios de evaluación…",
  "Revisando garantías y partidas…",
];

const NIVEL_STYLES: Record<NivelConfianza, string> = {
  ALTO: "bg-primary/10 text-primary",
  MEDIO: "bg-accent text-accent-foreground",
  BAJO: "bg-destructive/10 text-destructive",
};

const NIVEL_TEXT_STYLES: Record<NivelConfianza, string> = {
  ALTO: "text-primary",
  MEDIO: "text-accent-foreground",
  BAJO: "text-destructive",
};

const NIVEL_DESCRIPCIONES: Record<NivelConfianza, string> = {
  ALTO:
    "La IA encontró esta información de forma explícita en los documentos analizados. Puedes usarla con confianza, pero siempre corrobora los datos críticos (montos, fechas) antes de enviarlos.",
  MEDIO:
    "La información se infirió de texto parcial, ambiguo o disperso en varios fragmentos. Verifícala contra el documento original antes de usarla.",
  BAJO:
    "La IA no encontró información suficiente o clara para esta sección. Revisa manualmente los documentos originales — puede faltar información o estar en un anexo que aún no has subido.",
};

function ConfianzaBadge({ nivel }: { nivel: NivelConfianza | undefined }) {
  if (!nivel) return null;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
              NIVEL_STYLES[nivel],
            )}
          >
            Confianza: {nivel}
            <Info className="size-3" />
          </span>
        }
      />
      <TooltipContent className="max-w-64">{NIVEL_DESCRIPCIONES[nivel]}</TooltipContent>
    </Tooltip>
  );
}

function formatFecha(fecha: string | null | undefined) {
  if (!fecha) return "—";
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return fecha;
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

function formatMonto(monto: number | null, moneda: string | null) {
  if (monto === null) return "—";
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: moneda ?? "MXN" }).format(
    monto,
  );
}

const FECHA_LABELS: Record<string, string> = {
  fecha_publicacion: "Publicación",
  fecha_junta_aclaraciones: "Junta de aclaraciones",
  fecha_visita: "Visita",
  fecha_entrega_propuesta: "Entrega de propuesta",
  fecha_apertura_tecnica: "Apertura técnica",
  fecha_apertura_economica: "Apertura económica",
  fecha_fallo: "Fallo",
};

export function AnalisisIaTab({ licitacionId }: { licitacionId: string }) {
  const [analisis, setAnalisis] = useState<AnalisisBases | null | undefined>(undefined);
  const [documentos, setDocumentos] = useState<DocumentoProcesado[]>([]);
  const [documentoId, setDocumentoId] = useState(TODOS_LOS_DOCUMENTOS);
  const [analizando, setAnalizando] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [confirmandoSobreescritura, setConfirmandoSobreescritura] = useState(false);
  const stepInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const cargarAnalisis = useCallback(
    (docId: string) => {
      setAnalisis(undefined);
      const query = docId === TODOS_LOS_DOCUMENTOS ? "" : `?documento_id=${docId}`;
      return fetch(`/api/licitaciones/${licitacionId}/analisis${query}`)
        .then((res) => res.json())
        .then((json) => setAnalisis(json.data ?? null))
        .catch(() => setAnalisis(null));
    },
    [licitacionId],
  );

  // Cada documento (o "todos los documentos") tiene su propio análisis
  // guardado — al cambiar la selección, traemos el que ya exista para
  // mostrarlo de inmediato en vez de dejar la pantalla vacía hasta que el
  // usuario pida analizar de nuevo.
  useEffect(() => {
    // cargarAnalisis pone analisis en undefined (loading) antes del fetch,
    // igual al patrón que documenta react.dev para resetear estado derivado
    // de un id que cambia — necesario aquí para no mostrar el análisis del
    // documento anterior mientras carga el nuevo.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarAnalisis(documentoId);
  }, [documentoId, cargarAnalisis]);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("documentos")
      .select("id, nombre")
      .eq("licitacion_id", licitacionId)
      .eq("procesado", true)
      .order("created_at", { ascending: false })
      .then(({ data }) => setDocumentos(data ?? []));

    // Un documento subido en la pestaña Documentos puede tardar unos
    // segundos en procesarse (chunking + embeddings). Esta suscripción
    // hace que aparezca aquí en cuanto termina, sin tener que salir y
    // volver a entrar a la pestaña.
    const channel = supabase
      .channel(`documentos-procesados-${licitacionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "documentos",
          filter: `licitacion_id=eq.${licitacionId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const eliminado = payload.old as { id: string };
            setDocumentos((prev) => prev.filter((d) => d.id !== eliminado.id));
            return;
          }
          const doc = payload.new as { id: string; nombre: string; procesado: boolean };
          setDocumentos((prev) => {
            if (!doc.procesado) return prev.filter((d) => d.id !== doc.id);
            if (prev.some((d) => d.id === doc.id)) return prev;
            return [{ id: doc.id, nombre: doc.nombre }, ...prev];
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [licitacionId]);

  async function handleAnalizar() {
    setConfirmandoSobreescritura(false);
    setAnalizando(true);
    setStepIndex(0);
    stepInterval.current = setInterval(() => {
      setStepIndex((i) => Math.min(i + 1, PROGRESS_STEPS.length - 1));
    }, 4000);

    const res = await fetch(`/api/licitaciones/${licitacionId}/analizar-bases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documento_id: documentoId === TODOS_LOS_DOCUMENTOS ? undefined : documentoId,
      }),
    });
    const json = await res.json();

    if (stepInterval.current) clearInterval(stepInterval.current);
    setAnalizando(false);

    if (!res.ok) {
      toast.error("No se pudo analizar las bases", { description: json.error?.message ?? json.error });
      return;
    }

    setAnalisis(json.data);
    toast.success("Análisis completado");
  }

  function handleExportar() {
    window.print();
  }

  if (analisis === undefined) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const confianzas = analisis?.notas_json?.confianza_por_seccion ?? {};
  const documentoAnalizado = analisis?.notas_json?.documento_analizado;
  const documentacionRequerida = Array.isArray(analisis?.documentacion_requerida_json)
    ? analisis.documentacion_requerida_json
    : [];
  const criteriosEvaluacion = Array.isArray(analisis?.criterios_evaluacion_json)
    ? analisis.criterios_evaluacion_json
    : [];
  const garantias = Array.isArray(analisis?.garantias_json) ? analisis.garantias_json : [];

  return (
    <div className="flex flex-col gap-6" id="analisis-ia-printable">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={documentoId} onValueChange={(v) => v && setDocumentoId(v)}>
            <SelectTrigger className="w-64">
              <SelectValue>
                {(v: string) =>
                  v === TODOS_LOS_DOCUMENTOS
                    ? "Todos los documentos"
                    : (documentos.find((doc) => doc.id === v)?.nombre ?? v)
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS_LOS_DOCUMENTOS}>Todos los documentos</SelectItem>
              {documentos.map((doc) => (
                <SelectItem key={doc.id} value={doc.id}>
                  {doc.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={() => (analisis ? setConfirmandoSobreescritura(true) : handleAnalizar())}
            disabled={analizando}
          >
            <Sparkles />
            {analisis ? "Re-analizar" : "Analizar bases con IA"}
          </Button>
        </div>
        {analisis && (
          <Button variant="outline" onClick={handleExportar}>
            Exportar ficha como PDF
          </Button>
        )}
      </div>

      {!analizando && analisis && (
        <p className="-mt-4 text-xs text-muted-foreground print:hidden">
          Basado en: {documentoAnalizado ? documentoAnalizado.nombre : "todos los documentos"}
        </p>
      )}

      {analizando && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <Sparkles className="size-6 animate-pulse text-primary" />
            <p className="text-sm font-medium">{PROGRESS_STEPS[stepIndex]}</p>
            <p className="text-xs text-muted-foreground">Esto puede tardar uno o dos minutos.</p>
          </CardContent>
        </Card>
      )}

      {!analizando && !analisis && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Sube y procesa al menos un documento en la pestaña Documentos, luego analiza las
            bases con IA.
          </CardContent>
        </Card>
      )}

      {!analizando && analisis && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-1.5 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground print:hidden">
            <p className="font-medium text-foreground">
              ¿Qué significa el nivel de confianza de cada sección?
            </p>
            <p>
              <span className={cn("font-medium", NIVEL_TEXT_STYLES.ALTO)}>ALTO</span>
              {" — "}
              {NIVEL_DESCRIPCIONES.ALTO}
            </p>
            <p>
              <span className={cn("font-medium", NIVEL_TEXT_STYLES.MEDIO)}>MEDIO</span>
              {" — "}
              {NIVEL_DESCRIPCIONES.MEDIO}
            </p>
            <p>
              <span className={cn("font-medium", NIVEL_TEXT_STYLES.BAJO)}>BAJO</span>
              {" — "}
              {NIVEL_DESCRIPCIONES.BAJO}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Datos generales</CardTitle>
                <ConfianzaBadge nivel={confianzas.generales} />
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                <p>
                  <span className="text-muted-foreground">Objeto: </span>
                  {analisis.objeto_contrato ?? "—"}
                </p>
                <p>
                  <span className="text-muted-foreground">Tipo de procedimiento: </span>
                  {analisis.tipo_procedimiento ?? "—"}
                </p>
                <p>
                  <span className="text-muted-foreground">Monto máximo: </span>
                  {formatMonto(analisis.monto_maximo_estimado, analisis.moneda)}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Fechas</CardTitle>
                <ConfianzaBadge nivel={confianzas.fechas} />
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                  {Object.entries(FECHA_LABELS).map(([key, label]) => (
                    <div key={key}>
                      <dt className="text-xs text-muted-foreground">{label}</dt>
                      <dd>{formatFecha(analisis.fechas_json?.[key as keyof FechasAnalisis])}</dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Documentación requerida</CardTitle>
              <ConfianzaBadge nivel={confianzas.documentacion} />
            </CardHeader>
            <CardContent>
              {documentacionRequerida.length === 0 ? (
                <p className="text-sm text-muted-foreground">No se detectaron requisitos.</p>
              ) : (
                <ul className="flex flex-col divide-y text-sm">
                  {documentacionRequerida.map((item, i) => (
                    <li key={i} className="flex flex-col gap-0.5 py-2">
                      <span className="font-medium">
                        {item.descripcion}{" "}
                        <span className="text-xs font-normal text-muted-foreground">
                          ({item.categoria})
                        </span>
                      </span>
                      {item.fundamento_legal && (
                        <span className="text-xs text-muted-foreground">
                          {item.fundamento_legal}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Criterios de evaluación</CardTitle>
                <ConfianzaBadge nivel={confianzas.criterios} />
              </CardHeader>
              <CardContent>
                {criteriosEvaluacion.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No se detectaron criterios.</p>
                ) : (
                  <ul className="flex flex-col divide-y text-sm">
                    {criteriosEvaluacion.map((c, i) => (
                      <li key={i} className="flex items-center justify-between py-2">
                        <span>{c.criterio}</span>
                        <span className="font-medium">
                          {c.ponderacion_porcentaje !== null ? `${c.ponderacion_porcentaje}%` : "—"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Garantías</CardTitle>
                <ConfianzaBadge nivel={confianzas.garantias} />
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                {garantias.length === 0 ? (
                  <p className="text-muted-foreground">No se detectaron garantías.</p>
                ) : (
                  garantias.map((g, i) => (
                    <p key={i}>
                      <span className="font-medium">{g.tipo}</span>
                      {g.monto_o_porcentaje ? ` — ${g.monto_o_porcentaje}` : ""}
                      {g.vigencia ? ` (vigencia: ${g.vigencia})` : ""}
                    </p>
                  ))
                )}
                {analisis.forma_presentacion && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Forma de presentación: {analisis.forma_presentacion}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      <Dialog open={confirmandoSobreescritura} onOpenChange={setConfirmandoSobreescritura}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Sobrescribir el análisis guardado?</DialogTitle>
            <DialogDescription>
              Ya existe un análisis guardado para{" "}
              {documentoId === TODOS_LOS_DOCUMENTOS
                ? "todos los documentos"
                : `"${documentos.find((d) => d.id === documentoId)?.nombre ?? "este documento"}"`}
              . Al re-analizar se reemplazará con el resultado nuevo y no podrás recuperar el
              anterior.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmandoSobreescritura(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAnalizar}>Sobrescribir y analizar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
