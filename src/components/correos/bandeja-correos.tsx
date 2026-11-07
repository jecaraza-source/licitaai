"use client";

import { useEffect, useState } from "react";
import { Copy, Inbox, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorCarga } from "@/components/layout/error-carga";
import { DetalleCorreo } from "@/components/correos/detalle-correo";
import { cn } from "@/lib/utils";
import {
  ESTADOS_CORREO,
  ETIQUETAS_ESTADO_CORREO,
  type BandejaCorreos,
  type EstadoCorreo,
} from "@/lib/correos-compras-mx";

const PAGINA = 25;

const fecha = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Mexico_City" });

const VACIO: Record<EstadoCorreo, string> = {
  PENDIENTE: "No hay correos por revisar.",
  ASOCIADO: "Aún no has asociado ningún correo a una licitación.",
  DESCARTADO: "No has descartado ningún correo.",
};

export function BandejaCorreosContent({ puedeEscribir }: { puedeEscribir: boolean }) {
  const [estado, setEstado] = useState<EstadoCorreo>("PENDIENTE");
  const [pagina, setPagina] = useState(1);
  const [bandeja, setBandeja] = useState<BandejaCorreos | null>(null);
  const [error, setError] = useState(false);
  const [intento, setIntento] = useState(0);
  const [abierto, setAbierto] = useState<string | null>(null);

  useEffect(() => {
    let activo = true;
    fetch(`/api/correos?estado=${estado}&page=${pagina}&pageSize=${PAGINA}`)
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
      .then((json) => {
        if (!activo) return;
        setBandeja(json.data);
        setError(false);
      })
      .catch(() => activo && setError(true));
    return () => {
      activo = false;
    };
  }, [estado, pagina, intento]);

  function cambiarEstado(nuevo: EstadoCorreo) {
    setEstado(nuevo);
    setPagina(1);
  }

  async function copiarDireccion(direccion: string) {
    try {
      await navigator.clipboard.writeText(direccion);
      toast.success("Dirección copiada");
    } catch {
      toast.error("No se pudo copiar", { description: "Selecciónala y cópiala a mano." });
    }
  }

  const totalPaginas = bandeja ? Math.max(1, Math.ceil(bandeja.total / PAGINA)) : 1;

  return (
    <div className="flex flex-col gap-4">
      {bandeja && (
        <section aria-label="Dirección de entrada" className="rounded-xl border bg-card p-4">
          {bandeja.direccion ? (
            <>
              <p className="text-sm text-muted-foreground">
                Tu dirección de entrada de correos de Compras MX. Regístrala como correo de contacto en
                Compras MX, o reenvía a ella los avisos que ya recibes.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <code className="rounded-md bg-muted px-2 py-1 text-sm font-medium">{bandeja.direccion}</code>
                <Button size="sm" variant="outline" onClick={() => copiarDireccion(bandeja.direccion!)}>
                  <Copy className="size-3.5" aria-hidden="true" />
                  Copiar
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              La recepción de correos aún no está activada para esta instalación. Cuando se active, aquí verás
              la dirección de entrada de tu empresa.
            </p>
          )}
        </section>
      )}

      <div role="group" aria-label="Estado de los correos" className="flex flex-wrap gap-1.5">
        {ESTADOS_CORREO.map((e) => (
          <button
            key={e}
            type="button"
            aria-pressed={estado === e}
            onClick={() => cambiarEstado(e)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              estado === e ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            {ETIQUETAS_ESTADO_CORREO[e]}
            {bandeja && (
              <span className="ml-1.5 tabular-nums" aria-label={`${bandeja.conteos[e]} correos`}>
                {bandeja.conteos[e]}
              </span>
            )}
          </button>
        ))}
      </div>

      {error && (
        <ErrorCarga
          mensaje="No se pudo cargar la bandeja de correos."
          onReintentar={() => {
            setError(false);
            setIntento((n) => n + 1);
          }}
        />
      )}

      {!bandeja && !error && (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      )}

      {bandeja && bandeja.items.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-12 text-center">
          <Inbox className="size-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">{VACIO[estado]}</p>
        </div>
      )}

      {bandeja && bandeja.items.length > 0 && (
        <ul className="flex flex-col gap-2">
          {bandeja.items.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setAbierto(c.id)}
                className="flex w-full flex-col gap-1 rounded-xl border bg-card p-3 text-left transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className={cn("min-w-0 flex-1 truncate", c.estado === "PENDIENTE" ? "font-semibold" : "font-medium")}>
                    {c.asunto || "(sin asunto)"}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {fecha.format(new Date(c.recibido_en))}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  <span className="truncate">{c.de}</span>
                  {c.adjuntos.length > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <Paperclip className="size-3.5" aria-hidden="true" />
                      {c.adjuntos.length}
                      <span className="sr-only"> adjuntos</span>
                    </span>
                  )}
                  {!c.remitente_reconocido && (
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium">
                      Remitente no reconocido
                    </span>
                  )}
                  {c.estado === "PENDIENTE" && c.sugerencia && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      Parece de {c.sugerencia.numero_expediente}
                    </span>
                  )}
                  {c.estado === "ASOCIADO" && (
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                      {c.licitacion ? c.licitacion.numero_expediente : "Licitación eliminada"}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {bandeja && totalPaginas > 1 && (
        <div className="flex items-center justify-between text-sm">
          <Button size="sm" variant="outline" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>
            Anterior
          </Button>
          <span className="text-muted-foreground tabular-nums">
            Página {pagina} de {totalPaginas}
          </span>
          <Button size="sm" variant="outline" disabled={pagina >= totalPaginas} onClick={() => setPagina((p) => p + 1)}>
            Siguiente
          </Button>
        </div>
      )}

      <DetalleCorreo
        id={abierto}
        puedeEscribir={puedeEscribir}
        onCerrar={() => setAbierto(null)}
        onCambio={() => setIntento((n) => n + 1)}
      />
    </div>
  );
}
