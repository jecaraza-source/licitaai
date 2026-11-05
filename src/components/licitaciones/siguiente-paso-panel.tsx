"use client";

import Link from "next/link";
import { ArrowRight, CalendarClock, CircleCheck, TriangleAlert } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorCarga } from "@/components/layout/error-carga";
import { useGateLicitacion } from "@/components/licitaciones/gate-licitacion";
import { cn } from "@/lib/utils";
import { hrefPestana } from "@/lib/navegacion";
import { diasParaEntrega, estadoEntrega, titularSiguientePaso, type TonoEntrega } from "@/lib/siguiente-paso";

const TONO_ENTREGA: Record<TonoEntrega, string> = {
  vencida: "text-destructive",
  urgente: "text-destructive",
  proxima: "text-amber-600 dark:text-amber-400",
  holgada: "text-muted-foreground",
  "sin-fecha": "text-muted-foreground",
};

// Responde de un vistazo "¿qué falta para enviar?": la cuenta regresiva a la
// entrega y, una por línea, lo que bloquea la compuerta, cada una con enlace a
// la pestaña donde se resuelve. Desaparece cuando la licitación ya se envió.
export function SiguientePasoPanel({
  licitacionId,
  fechaEntrega,
}: {
  licitacionId: string;
  fechaEntrega: string | null;
}) {
  const { activo, gate, pasos, error, recargar } = useGateLicitacion();
  if (!activo) return null;

  const entrega = estadoEntrega(diasParaEntrega(fechaEntrega, new Date()));

  if (!gate) {
    return error ? (
      <ErrorCarga mensaje="No se pudo consultar qué falta para enviar." onReintentar={recargar} />
    ) : (
      <Skeleton className="h-24 w-full rounded-xl" />
    );
  }

  const listo = !gate.bloqueado;

  return (
    <section
      aria-labelledby="siguiente-paso-titulo"
      className={cn(
        "rounded-xl border p-4 sm:p-5",
        listo ? "border-emerald-500/40 bg-emerald-500/5" : "bg-card",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div className="flex items-center gap-2.5">
          {listo ? (
            <CircleCheck className="size-5 shrink-0 text-emerald-600" aria-hidden="true" />
          ) : (
            <TriangleAlert className="size-5 shrink-0 text-amber-600" aria-hidden="true" />
          )}
          <div>
            <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">Siguiente paso</p>
            <h2 id="siguiente-paso-titulo" className="text-base font-semibold">
              {titularSiguientePaso(gate, pasos)}
            </h2>
          </div>
        </div>
        <p className={cn("flex items-center gap-1.5 text-sm font-medium", TONO_ENTREGA[entrega.tono])}>
          <CalendarClock className="size-4" aria-hidden="true" />
          {entrega.etiqueta}
        </p>
      </div>

      {error && (
        <p role="status" className="mt-2 text-xs text-muted-foreground">
          No se pudo actualizar; se muestra la última lectura.
        </p>
      )}

      {pasos.length > 0 && (
        <ul className="mt-3 flex flex-col divide-y rounded-lg border bg-background">
          {pasos.map((paso, i) => (
            <li key={paso.clave}>
              <Link
                href={hrefPestana(licitacionId, paso.pestana)}
                className="group flex items-center justify-between gap-3 px-3 py-2 text-sm transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
              >
                <span className={cn(i === 0 && "font-medium")}>
                  {paso.texto}
                  {i === 0 && (
                    <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      Empieza aquí
                    </span>
                  )}
                </span>
                <ArrowRight
                  className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
