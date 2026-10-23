"use client";

import { useCallback, useEffect, useState } from "react";
import { RevisorPropuestaCard } from "@/components/licitaciones/revisor-propuesta-card";

interface EstadoRevision {
  elaborado_por: string | null;
  revisor_id: string | null;
  revisado_at: string | null;
  vigente: boolean;
  motivo: string | null;
  hay_partidas: boolean;
}

/** Doble check (Paso 17) de la propuesta económica: la revisión confirmada
 * deja de valer si las partidas cambian después. */
export function RevisorEconomicaCard({
  licitacionId,
  refreshKey = 0,
}: {
  licitacionId: string;
  /** Cambia cada vez que se guarda la hoja, para recalcular si la revisión sigue vigente. */
  refreshKey?: number;
}) {
  const [estado, setEstado] = useState<EstadoRevision | null>(null);
  const endpoint = `/api/licitaciones/${licitacionId}/propuesta-economica/revisor`;

  const cargar = useCallback(() => {
    fetch(endpoint)
      .then((res) => res.json())
      .then((json) => setEstado(json.data ?? null))
      .catch(() => setEstado(null));
  }, [endpoint]);

  useEffect(() => {
    cargar();
  }, [cargar, refreshKey]);

  if (!estado?.hay_partidas) return null;

  const obsoleta = estado.motivo === "CONTENIDO_CAMBIO";

  return (
    <RevisorPropuestaCard
      licitacionId={licitacionId}
      endpoint={endpoint}
      createdBy={estado.elaborado_por}
      revisorId={estado.revisor_id}
      revisadoAt={obsoleta ? null : estado.revisado_at}
      aviso={
        obsoleta
          ? "La hoja económica cambió después de la revisión: el revisor debe confirmar de nuevo."
          : null
      }
      onUpdated={cargar}
    />
  );
}
