"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  esperarJob,
  esperarLote,
  type EstadoJobLote,
  type ProgresoLote,
  type ResultadoJob,
  type ResultadoLote,
} from "@/lib/esperar-job";
import type { Job } from "@/types";

// Cuando una ruta de IA responde 202 (flag `jobs.async_*` activo), la pantalla
// llama a `esperar(job_id)` y sigue su flujo normal cuando el job termina:
//
//   const json = await res.json();
//   const asinc = respuestaAsincrona(json);
//   if (asinc) {
//     const r = await esperar(asinc.job_id);
//     if (r.estado !== "completado") { …avisar…; return; }
//     await recargar();      // el resultado ya está guardado en la base
//   }
//
// Se cancela solo si la pantalla se desmonta. Varias esperas simultáneas son
// válidas (cada una con su propio AbortController).

export interface UseEsperarJob {
  esperar: (jobId: string) => Promise<ResultadoJob>;
  esperarJobs: (ids: string[]) => Promise<ResultadoLote>;
  /** Último estado leído del job que se espera (para <JobStatusView>). */
  job: Job | null;
  /** Avance del lote en curso (auditar todos). */
  lote: ProgresoLote | null;
  /** Pide cancelar el job que se espera; la espera termina como "cancelado". */
  cancelar: () => Promise<void>;
}

async function fetchEstadosPorSupabase(ids: string[]): Promise<EstadoJobLote[]> {
  // RLS de public.jobs acota a la organización del usuario (misma vía que
  // usa Realtime en useJob).
  const { data, error } = await createClient().from("jobs").select("id, estado").in("id", ids);
  if (error) throw new Error(error.message);
  return (data ?? []) as EstadoJobLote[];
}

export function useEsperarJob(): UseEsperarJob {
  const controladores = useRef(new Set<AbortController>());
  const jobActual = useRef<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [lote, setLote] = useState<ProgresoLote | null>(null);

  useEffect(() => {
    const activos = controladores.current;
    return () => {
      for (const c of activos) c.abort();
      activos.clear();
    };
  }, []);

  const esperar = useCallback(async (jobId: string) => {
    const ctl = new AbortController();
    controladores.current.add(ctl);
    jobActual.current = jobId;
    setJob(null);
    try {
      return await esperarJob(jobId, {
        signal: ctl.signal,
        onJob: (j) => setJob(j),
      });
    } finally {
      controladores.current.delete(ctl);
    }
  }, []);

  const esperarJobs = useCallback(async (ids: string[]) => {
    const ctl = new AbortController();
    controladores.current.add(ctl);
    setLote({ total: ids.length, terminados: 0, completados: 0, fallidos: 0 });
    try {
      return await esperarLote(ids, {
        fetchEstados: fetchEstadosPorSupabase,
        signal: ctl.signal,
        onProgreso: setLote,
      });
    } finally {
      controladores.current.delete(ctl);
    }
  }, []);

  const cancelar = useCallback(async () => {
    const id = jobActual.current;
    if (!id) return;
    await fetch(`/api/jobs/${id}/cancel`, { method: "POST" }).catch(() => undefined);
  }, []);

  return { esperar, esperarJobs, job, lote, cancelar };
}
