"use client";

import { useEffect, useState } from "react";
import { Mail } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorCarga } from "@/components/layout/error-carga";
import type { CorreoDetalle } from "@/lib/correos-compras-mx";

const fecha = new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeStyle: "short", timeZone: "America/Mexico_City" });

// Historial de correos de Compras MX asociados a esta licitación (aclaraciones,
// fallos, notificaciones). Se asocian desde la bandeja de Correos.
export function CorreosLicitacionCard({ licitacionId }: { licitacionId: string }) {
  const [correos, setCorreos] = useState<CorreoDetalle[] | null>(null);
  const [error, setError] = useState(false);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let activo = true;
    fetch(`/api/licitaciones/${licitacionId}/correos`)
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
      .then((json) => activo && setCorreos(json.data ?? []))
      .catch(() => activo && setError(true));
    return () => {
      activo = false;
    };
  }, [licitacionId, intento]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="size-4 text-primary" aria-hidden="true" />
          Correos de Compras MX
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {error && (
          <ErrorCarga
            mensaje="No se pudieron cargar los correos de esta licitación."
            onReintentar={() => {
              setError(false);
              setIntento((n) => n + 1);
            }}
          />
        )}
        {!correos && !error && <Skeleton className="h-16 w-full" />}
        {correos && correos.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Aún no hay correos asociados. Los que lleguen a tu dirección de entrada se asocian desde Correos.
          </p>
        )}
        {correos?.map((c) => (
          <details key={c.id} className="rounded-lg border p-3">
            <summary className="flex cursor-pointer flex-wrap items-baseline justify-between gap-x-3 text-sm font-medium">
              <span className="min-w-0 flex-1 truncate">{c.asunto || "(sin asunto)"}</span>
              <span className="shrink-0 text-xs font-normal tabular-nums text-muted-foreground">
                {fecha.format(new Date(c.recibido_en))}
              </span>
            </summary>
            <p className="mt-2 text-xs text-muted-foreground">De {c.de}</p>
            <pre className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg bg-muted p-3 font-sans text-sm">
              {c.cuerpo_texto || "(El correo no tiene texto.)"}
            </pre>
          </details>
        ))}
      </CardContent>
    </Card>
  );
}
