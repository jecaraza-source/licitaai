"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useGateLicitacion } from "@/components/licitaciones/gate-licitacion";
import {
  ETIQUETAS_ESTADO as ESTADO_LABELS,
  etapasOmitidas,
  pasoPrevio,
  siguienteEstado,
  tipoCambioEstado,
  type PasoPrevio,
} from "@/lib/estados";
import { ESTADOS_LICITACION } from "@/lib/validations/licitacion";
import { hrefPestana } from "@/lib/navegacion";
import { compuertaRelevante } from "@/lib/siguiente-paso";
import type { EstadoLicitacion } from "@/types";

interface Solicitud {
  nuevo: EstadoLicitacion;
  previo: Exclude<PasoPrevio, "directo">;
}

export function EstadoSelector({
  licitacionId,
  estadoActual,
}: {
  licitacionId: string;
  estadoActual: EstadoLicitacion;
}) {
  const router = useRouter();
  const [estado, setEstado] = useState(estadoActual);
  const [isPending, startTransition] = useTransition();
  const [solicitud, setSolicitud] = useState<Solicitud | null>(null);
  const { gate, pasos } = useGateLicitacion();

  // Mientras no se haya leído la compuerta no se sabe qué falta: se deja
  // intentar y, si hace falta, la API responde con el detalle.
  const pendientesDeEnvio = gate ? pasos.reduce((suma, p) => suma + p.cantidad, 0) : 0;
  const siguiente = siguienteEstado(estado);

  // Decide qué pasa antes de cambiar: avance normal directo; envío con
  // pendientes, envío sin pendientes, retroceso o salto, con aviso.
  function pedirCambio(nuevo: string | null) {
    if (!nuevo || nuevo === estado) return;
    const destino = nuevo as EstadoLicitacion;
    const previo = pasoPrevio(estado, destino, pendientesDeEnvio);
    if (previo === "directo") void handleChange(destino);
    else setSolicitud({ nuevo: destino, previo });
  }

  function confirmarSolicitud() {
    const s = solicitud;
    setSolicitud(null);
    if (s) void handleChange(s.nuevo);
  }

  async function handleChange(nuevo: string | null) {
    if (!nuevo || nuevo === estado) return;
    const anterior = estado;
    setEstado(nuevo as EstadoLicitacion);

    const res = await fetch(`/api/licitaciones/${licitacionId}/estado`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado_licitacion: nuevo }),
    });

    if (!res.ok) {
      setEstado(anterior);
      const irALiberacion = {
        label: "Ir a Liberación",
        onClick: () => router.push(hrefPestana(licitacionId, "liberacion")),
      };
      const json = await res.json().catch(() => null);
      const gate = json?.error?.details?.gate ?? json?.gate;
      if (res.status === 409 && gate) {
        const { rojos, amarillosCriticos, pendientesLiberacion } = gate;
        toast.error("No se puede marcar como enviada", {
          description: `Faltan: ${rojos} requisito(s) en rojo, ${amarillosCriticos} crítico(s) en amarillo, ${pendientesLiberacion} punto(s) del checklist de liberación. Revisa las pestañas Auditoría y Liberación.`,
          action: irALiberacion,
        });
      } else {
        toast.error("No se pudo cambiar el estado", {
          description: json?.error?.message ?? json?.error,
          // Un 409 es un bloqueo de la compuerta (revisión independiente, análisis
          // de IA sin revisar…): el detalle está en Liberación.
          ...(res.status === 409 ? { action: irALiberacion } : {}),
        });
      }
      return;
    }

    toast.success(`Estado actualizado a "${ESTADO_LABELS[nuevo as EstadoLicitacion]}"`);
    startTransition(() => router.refresh());
  }

  const primerPaso = pasos[0];
  const omitidas = solicitud ? etapasOmitidas(estado, solicitud.nuevo) : [];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {siguiente && (
        <Button onClick={() => pedirCambio(siguiente)} disabled={isPending}>
          Avanzar a {ESTADO_LABELS[siguiente]}
          {siguiente === "ENVIADA" && compuertaRelevante(estado) && pendientesDeEnvio > 0 && (
            <span className="ml-1.5 rounded-full bg-primary-foreground/25 px-1.5 text-xs font-semibold tabular-nums">
              {pendientesDeEnvio}
              <span className="sr-only"> pendientes antes de enviar</span>
            </span>
          )}
        </Button>
      )}
      <Select value={estado} onValueChange={pedirCambio} disabled={isPending}>
        <SelectTrigger className="w-44" aria-label="Cambiar estado">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ESTADOS_LICITACION.map((e) => (
            <SelectItem key={e} value={e}>
              {ESTADO_LABELS[e]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Dialog open={solicitud !== null} onOpenChange={(abierto) => !abierto && setSolicitud(null)}>
        <DialogContent>
          {solicitud?.previo === "bloqueado" && (
            <>
              <DialogHeader>
                <DialogTitle>Aún no se puede marcar como enviada</DialogTitle>
                <DialogDescription>Esto falta resolver antes de enviar la propuesta:</DialogDescription>
              </DialogHeader>
              <ul className="flex flex-col gap-1.5 text-sm">
                {pasos.map((p) => (
                  <li key={p.clave}>
                    <a
                      href={hrefPestana(licitacionId, p.pestana)}
                      onClick={(ev) => {
                        ev.preventDefault();
                        setSolicitud(null);
                        router.push(hrefPestana(licitacionId, p.pestana));
                      }}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {p.texto}
                    </a>
                  </li>
                ))}
              </ul>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSolicitud(null)}>
                  Cerrar
                </Button>
                {primerPaso && (
                  <Button
                    onClick={() => {
                      setSolicitud(null);
                      router.push(hrefPestana(licitacionId, primerPaso.pestana));
                    }}
                  >
                    Empezar por el primero
                  </Button>
                )}
              </DialogFooter>
            </>
          )}

          {solicitud?.previo === "confirmar-envio" && (
            <>
              <DialogHeader>
                <DialogTitle>¿Ya enviaste la propuesta?</DialogTitle>
                <DialogDescription>
                  Marca la licitación como enviada cuando la propuesta ya esté enviada en Compras MX. El cambio
                  queda registrado en la bitácora de auditoría.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSolicitud(null)}>
                  Cancelar
                </Button>
                <Button onClick={confirmarSolicitud}>Marcar como enviada</Button>
              </DialogFooter>
            </>
          )}

          {solicitud?.previo === "confirmar" && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {tipoCambioEstado(estado, solicitud.nuevo) === "retroceso"
                    ? `Regresar a ${ESTADO_LABELS[solicitud.nuevo]}`
                    : `Saltar a ${ESTADO_LABELS[solicitud.nuevo]}`}
                </DialogTitle>
                <DialogDescription>
                  {tipoCambioEstado(estado, solicitud.nuevo) === "retroceso"
                    ? `La licitación está en ${ESTADO_LABELS[estado]} y volverá a ${ESTADO_LABELS[solicitud.nuevo]}.`
                    : `La licitación está en ${ESTADO_LABELS[estado]} y pasará a ${ESTADO_LABELS[solicitud.nuevo]} sin pasar por ${omitidas.map((o) => ESTADO_LABELS[o]).join(" ni ")}.`}
                  {tipoCambioEstado(estado, solicitud.nuevo) === "retroceso" &&
                    ESTADOS_LICITACION.indexOf(estado) >= ESTADOS_LICITACION.indexOf("ENVIADA") &&
                    compuertaRelevante(solicitud.nuevo) &&
                    " Volverá a aplicarse la revisión de requisitos antes de poder enviarla."}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSolicitud(null)}>
                  Cancelar
                </Button>
                <Button onClick={confirmarSolicitud}>Cambiar a {ESTADO_LABELS[solicitud.nuevo]}</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
