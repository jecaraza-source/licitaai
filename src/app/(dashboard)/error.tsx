"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

// Sin este boundary, cualquier error de render en el dashboard (pestañas de
// licitación, configuración, etc.) escalaba hasta `global-error.tsx` y
// tumbaba toda la app — sidebar incluido — en vez de solo esta sección.
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  // Tras un despliegue nuevo, un chunk cargado dinámicamente (p. ej. al
  // cambiar de pestaña) puede apuntar a un archivo que el build anterior ya
  // no sirve. `reset()` no alcanza porque el navegador necesita el
  // manifiesto nuevo — hace falta una recarga completa.
  const esChunkObsoleto =
    /Loading chunk|ChunkLoadError|Failed to fetch dynamically imported module/i.test(
      `${error.name} ${error.message}`,
    );

  useEffect(() => {
    if (esChunkObsoleto) {
      window.location.reload();
    }
  }, [esChunkObsoleto]);

  if (esChunkObsoleto) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-center">
        <p className="text-sm text-muted-foreground">Actualizando a la última versión…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center">
      <h2 className="text-lg font-semibold">Algo salió mal en esta sección</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        El error fue reportado automáticamente. Puedes intentar de nuevo sin perder tu sesión.
      </p>
      <Button onClick={reset} variant="outline">
        <RotateCw />
        Reintentar
      </Button>
    </div>
  );
}
