"use client";

import { useEffect, useRef } from "react";
import { Loader2, CheckCircle2, XCircle, Ban, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useJob } from "@/hooks/use-job";
import { ESTADOS_JOB_TERMINALES, type EstadoJob, type Job } from "@/types";

// P2 · A5 — barra de progreso + estado en vivo de un job (ADR 0003).
// Se suscribe vía useJob (Realtime con fallback a polling).

const ETIQUETA_ESTADO: Record<EstadoJob, string> = {
  PENDING: "En cola",
  AUTHORIZED: "En cola",
  RUNNING: "Procesando",
  RETRYING: "Reintentando",
  COMPLETED: "Completado",
  FAILED: "Falló",
  CANCELLED: "Cancelado",
  EXPIRED: "Expiró",
};

function IconoEstado({ estado }: { estado: EstadoJob }) {
  if (estado === "COMPLETED") return <CheckCircle2 className="size-4 text-primary" />;
  if (estado === "FAILED" || estado === "EXPIRED") return <XCircle className="size-4 text-destructive" />;
  if (estado === "CANCELLED") return <Ban className="size-4 text-muted-foreground" />;
  if (estado === "PENDING" || estado === "AUTHORIZED") return <Clock className="size-4 text-muted-foreground" />;
  return <Loader2 className="size-4 animate-spin text-primary" />;
}

export interface JobStatusProps {
  jobId: string | null | undefined;
  /** Se llama una vez cuando el job llega a COMPLETED. */
  onCompleted?: (job: Job) => void;
  /** Se llama una vez cuando el job llega a FAILED / EXPIRED / CANCELLED. */
  onFailed?: (job: Job) => void;
  /** Oculta el botón de cancelar. */
  sinCancelar?: boolean;
  className?: string;
}

export function JobStatus({ jobId, onCompleted, onFailed, sinCancelar, className }: JobStatusProps) {
  const { job, cargando, error, usandoPolling, cancelar } = useJob(jobId);
  const notificado = useRef<string | null>(null);

  useEffect(() => {
    if (!job || notificado.current === job.id) return;
    if (job.estado === "COMPLETED") {
      notificado.current = job.id;
      onCompleted?.(job);
    } else if (job.estado === "FAILED" || job.estado === "EXPIRED" || job.estado === "CANCELLED") {
      notificado.current = job.id;
      onFailed?.(job);
    }
  }, [job, onCompleted, onFailed]);

  if (!jobId) return null;

  if (cargando && !job) {
    return (
      <div className={cn("flex items-center gap-2 text-sm text-muted-foreground", className)}>
        <Loader2 className="size-4 animate-spin" />
        Consultando estado…
      </div>
    );
  }

  if (error && !job) {
    return <p className={cn("text-sm text-destructive", className)}>{error}</p>;
  }
  if (!job) return null;

  const terminal = ESTADOS_JOB_TERMINALES.includes(job.estado);
  const activo = !terminal;
  const progreso = job.estado === "COMPLETED" ? 100 : Math.max(0, Math.min(100, job.progreso));

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="flex items-center gap-2 font-medium">
          <IconoEstado estado={job.estado} />
          {ETIQUETA_ESTADO[job.estado]}
          {job.estado === "RETRYING" && job.intentos > 0 && (
            <span className="text-muted-foreground">
              (intento {job.intentos}/{job.max_intentos})
            </span>
          )}
        </span>
        {activo && !sinCancelar && (
          <Button variant="ghost" size="sm" onClick={() => void cancelar()}>
            Cancelar
          </Button>
        )}
      </div>

      {activo && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${progreso}%` }}
          />
        </div>
      )}

      {job.progreso_detalle && activo && (
        <p className="text-xs text-muted-foreground">{job.progreso_detalle}</p>
      )}

      {(job.estado === "FAILED" || job.estado === "EXPIRED") && job.error_seguro && (
        <p className="text-xs text-destructive">{job.error_seguro}</p>
      )}

      {usandoPolling && activo && (
        <p className="text-[11px] text-muted-foreground/70">
          Actualización en vivo no disponible; consultando cada pocos segundos.
        </p>
      )}
    </div>
  );
}
