"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useEstadoIA } from "@/hooks/use-estado-ia";
import { useRealtimeLista } from "@/hooks/use-realtime-lista";
import type { AnalisisBases } from "@/types";

export const TODOS_LOS_DOCUMENTOS = "__todos__";

export interface DocumentoProcesado {
  id: string;
  nombre: string;
}

export const PROGRESS_STEPS = [
  "Buscando fragmentos relevantes en los documentos…",
  "Analizando objeto y montos…",
  "Extrayendo fechas del procedimiento…",
  "Identificando documentación requerida…",
  "Analizando criterios de evaluación…",
  "Revisando garantías y partidas…",
];

export function useAnalisisIaTab(licitacionId: string) {
  const [analisis, setAnalisis] = useState<AnalisisBases | null | undefined>(undefined);
  // P1.5 — la lista de documentos procesados + su suscripción Realtime
  // (aparecen aquí en cuanto termina el chunking/embeddings) vive en el
  // hook compartido; la limpieza del canal está garantizada.
  const { items: documentos } = useRealtimeLista<
    { id: string; nombre: string; procesado: boolean },
    DocumentoProcesado
  >({
    tabla: "documentos",
    filtro: `licitacion_id=eq.${licitacionId}`,
    select: "id, nombre, procesado",
    orden: { columna: "created_at" },
    incluir: (d) => d.procesado === true,
    mapear: (d) => ({ id: d.id, nombre: d.nombre }),
  });
  const [documentoId, setDocumentoId] = useState(TODOS_LOS_DOCUMENTOS);
  const [analizando, setAnalizando] = useState(false);
  const { iaDisponible } = useEstadoIA();
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

  return {
    analisis,
    documentos,
    documentoId,
    setDocumentoId,
    analizando,
    iaDisponible,
    stepIndex,
    confirmandoSobreescritura,
    setConfirmandoSobreescritura,
    handleAnalizar,
    handleExportar,
  };
}
