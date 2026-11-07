"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Paperclip, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorCarga } from "@/components/layout/error-carga";
import { BuscadorLicitacion } from "@/components/correos/buscador-licitacion";
import { hrefPestana } from "@/lib/navegacion";
import type { CorreoDetalle, LicitacionDeCorreo } from "@/lib/correos-compras-mx";

const fechaHora = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "America/Mexico_City",
});

function tamano(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// Un correo abierto: su contenido (solo texto) y, si el usuario puede escribir,
// qué hacer con él: asociarlo a una licitación, descartarlo o devolverlo a la
// bandeja.
export function DetalleCorreo({
  id,
  puedeEscribir,
  onCerrar,
  onCambio,
}: {
  id: string | null;
  puedeEscribir: boolean;
  onCerrar: () => void;
  /** Se llama tras asociar, descartar o restaurar, para refrescar la bandeja. */
  onCambio: () => void;
}) {
  const [correo, setCorreo] = useState<CorreoDetalle | null>(null);
  const [error, setError] = useState(false);
  const [intento, setIntento] = useState(0);
  const [elegida, setElegida] = useState<LicitacionDeCorreo | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!id) return;
    let activo = true;
    fetch(`/api/correos/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
      .then((json) => {
        if (!activo) return;
        setCorreo(json.data);
        setElegida(json.data?.sugerencia ?? null);
      })
      .catch(() => activo && setError(true));
    return () => {
      activo = false;
    };
  }, [id, intento]);

  // Al abrir otro correo se parte de cero (no se ve el anterior mientras carga).
  const [idPrevio, setIdPrevio] = useState(id);
  if (id !== idPrevio) {
    setIdPrevio(id);
    setCorreo(null);
    setError(false);
    setElegida(null);
  }

  async function gestionar(cuerpo: { accion: "asociar"; licitacion_id: string } | { accion: "descartar" | "restaurar" }) {
    if (!id) return;
    setGuardando(true);
    try {
      const res = await fetch(`/api/correos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        toast.error("No se pudo actualizar el correo", { description: json?.error?.message });
        return;
      }
      toast.success(
        cuerpo.accion === "asociar"
          ? "Correo asociado a la licitación"
          : cuerpo.accion === "descartar"
            ? "Correo descartado"
            : "Correo devuelto a la bandeja",
      );
      onCambio();
      onCerrar();
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialog open={id !== null} onOpenChange={(abierto) => !abierto && onCerrar()}>
      <DialogContent className="max-h-[90vh] gap-4 overflow-y-auto sm:max-w-2xl">
        {error ? (
          <>
            <DialogHeader>
              <DialogTitle>Correo</DialogTitle>
            </DialogHeader>
            <ErrorCarga
              mensaje="No se pudo abrir el correo."
              onReintentar={() => {
                setError(false);
                setIntento((n) => n + 1);
              }}
            />
          </>
        ) : !correo ? (
          <>
            <DialogHeader>
              <DialogTitle>Abriendo correo…</DialogTitle>
            </DialogHeader>
            <Skeleton className="h-40 w-full" />
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-balance">{correo.asunto || "(sin asunto)"}</DialogTitle>
              <DialogDescription>
                De {correo.de} · {fechaHora.format(new Date(correo.recibido_en))}
              </DialogDescription>
            </DialogHeader>

            {!correo.remitente_reconocido && (
              <div
                role="note"
                className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
              >
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <p>
                  El remitente no es un dominio gubernamental (.gob.mx). Verifica que el correo sea legítimo
                  antes de actuar con lo que dice.
                </p>
              </div>
            )}

            <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg bg-muted p-3 font-sans text-sm">
              {correo.cuerpo_texto || "(El correo no tiene texto.)"}
            </pre>

            {correo.adjuntos.length > 0 && (
              <div className="text-sm">
                <p className="mb-1 flex items-center gap-1.5 font-medium">
                  <Paperclip className="size-3.5" aria-hidden="true" />
                  Adjuntos ({correo.adjuntos.length})
                </p>
                <ul className="flex flex-col gap-0.5 text-muted-foreground">
                  {correo.adjuntos.map((a, i) => (
                    <li key={i}>
                      {a.nombre} · {tamano(a.tamano)}
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-xs text-muted-foreground">
                  Los archivos adjuntos no se guardan en LicitaAI: descárgalos del correo original.
                </p>
              </div>
            )}

            {correo.estado === "PENDIENTE" && puedeEscribir && (
              <div className="flex flex-col gap-2 border-t pt-4">
                <p className="text-sm font-medium">¿A qué licitación corresponde?</p>
                <BuscadorLicitacion seleccionada={elegida} onElegir={setElegida} sugerida={correo.sugerencia} />
              </div>
            )}

            {correo.estado === "ASOCIADO" && (
              <p className="border-t pt-4 text-sm">
                {correo.licitacion ? (
                  <>
                    Asociado a{" "}
                    <Link
                      href={hrefPestana(correo.licitacion.id, "seguimiento")}
                      className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {correo.licitacion.numero_expediente}
                    </Link>
                    .
                  </>
                ) : (
                  "Estaba asociado a una licitación que ya no existe."
                )}
              </p>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={onCerrar}>
                Cerrar
              </Button>
              {puedeEscribir && correo.estado === "PENDIENTE" && (
                <>
                  <Button variant="outline" disabled={guardando} onClick={() => gestionar({ accion: "descartar" })}>
                    Descartar
                  </Button>
                  <Button
                    disabled={guardando || !elegida}
                    onClick={() => elegida && gestionar({ accion: "asociar", licitacion_id: elegida.id })}
                  >
                    {elegida ? `Asociar a ${elegida.numero_expediente}` : "Asociar a una licitación"}
                  </Button>
                </>
              )}
              {puedeEscribir && correo.estado !== "PENDIENTE" && (
                <Button variant="outline" disabled={guardando} onClick={() => gestionar({ accion: "restaurar" })}>
                  Devolver a la bandeja
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
