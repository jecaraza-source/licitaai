"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ESTADOS_JOB_TERMINALES, type Job } from "@/types";

// P2 · A5 — sigue el estado de un job (ADR 0003).
//
// Baseline: polling de GET /api/jobs/:id cada 4s (backoff a 10s), que se
// detiene al llegar a un estado terminal. Encima, una suscripción Realtime
// (postgres_changes sobre public.jobs) que, ante cualquier cambio, dispara
// un refetch inmediato — así el progreso se ve al instante cuando Realtime
// funciona, y el polling garantiza que igual converge si no.

const POLL_MIN_MS = 4_000;
const POLL_MAX_MS = 10_000;

function esTerminal(estado: string | undefined | null): boolean {
  return !!estado && ESTADOS_JOB_TERMINALES.includes(estado as Job["estado"]);
}

export interface UseJobResult {
  job: Job | null;
  cargando: boolean;
  error: string | null;
  /** true mientras la vía activa sea polling (Realtime no confirmado). */
  usandoPolling: boolean;
  cancelar: () => Promise<void>;
  refrescar: () => Promise<void>;
}

async function fetchJob(jobId: string): Promise<{ job: Job } | { error: string }> {
  try {
    const res = await fetch(`/api/jobs/${jobId}`);
    if (res.status === 404) return { error: "El trabajo no existe o no tienes acceso." };
    if (!res.ok) return { error: "No se pudo consultar el estado del trabajo." };
    const body = await res.json();
    return { job: body.data as Job };
  } catch {
    return { error: "No se pudo consultar el estado del trabajo." };
  }
}

export function useJob(jobId: string | null | undefined): UseJobResult {
  const [job, setJob] = useState<Job | null>(null);
  const [cargando, setCargando] = useState<boolean>(!!jobId);
  const [error, setError] = useState<string | null>(null);
  const [usandoPolling, setUsandoPolling] = useState(false);

  // Reset al cambiar el job observado — "ajustar estado durante el render"
  // (patrón recomendado por React, no en un efecto).
  const [jobIdPrevio, setJobIdPrevio] = useState(jobId);
  if (jobId !== jobIdPrevio) {
    setJobIdPrevio(jobId);
    setJob(null);
    setError(null);
    setUsandoPolling(false);
    setCargando(!!jobId);
  }

  useEffect(() => {
    if (!jobId) return;
    let cancelado = false;
    let intervalo: ReturnType<typeof setInterval> | null = null;
    let delay = POLL_MIN_MS;
    let realtimeVivo = false;
    const supabase = createClient();

    const aplicar = (r: { job: Job } | { error: string }) => {
      if (cancelado) return;
      if ("job" in r) {
        setJob(r.job);
        setError(null);
        if (esTerminal(r.job.estado) && intervalo) {
          clearInterval(intervalo);
          intervalo = null;
        }
      } else {
        setError((prev) => prev ?? r.error);
      }
    };

    const cargar = () => fetchJob(jobId).then(aplicar);

    // Fetch inicial.
    cargar().finally(() => {
      if (!cancelado) setCargando(false);
    });

    // Polling con backoff — se re-crea el intervalo al alargar el delay.
    const arrancarIntervalo = () => {
      if (intervalo) clearInterval(intervalo);
      intervalo = setInterval(() => {
        if (cancelado) return;
        void cargar();
        setUsandoPolling(!realtimeVivo);
        if (delay < POLL_MAX_MS) {
          delay = Math.min(delay * 1.5, POLL_MAX_MS);
          arrancarIntervalo();
        }
      }, delay);
    };
    arrancarIntervalo();

    const channel = supabase
      .channel(`job-${jobId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "jobs", filter: `id=eq.${jobId}` },
        () => {
          realtimeVivo = true;
          void cargar();
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          realtimeVivo = true;
          setUsandoPolling(false);
        }
      });

    return () => {
      cancelado = true;
      if (intervalo) clearInterval(intervalo);
      supabase.removeChannel(channel);
    };
  }, [jobId]);

  const cancelar = useCallback(async () => {
    if (!jobId) return;
    const res = await fetch(`/api/jobs/${jobId}/cancel`, { method: "POST" });
    if (res.ok) {
      const body = await res.json();
      setJob(body.data as Job);
    }
  }, [jobId]);

  const refrescar = useCallback(async () => {
    if (!jobId) return;
    const r = await fetchJob(jobId);
    if ("job" in r) setJob(r.job);
  }, [jobId]);

  return { job, cargando, error, usandoPolling, cancelar, refrescar };
}
