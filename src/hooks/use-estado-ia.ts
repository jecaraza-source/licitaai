"use client";

import { useEffect, useState } from "react";

// P2 · E6 — estado de disponibilidad de los proveedores de IA (ADR 0005).
// Los componentes con acciones de IA lo consultan para deshabilitar el
// botón (con aviso) cuando un circuit breaker está abierto, en vez de
// encolar un job que solo va a esperar.

interface EstadoIA {
  iaDisponible: boolean;
  circuitos: Record<string, "CLOSED" | "OPEN" | "HALF_OPEN">;
}

const REFRESCO_MS = 60_000;

export function useEstadoIA(): EstadoIA & { cargando: boolean } {
  const [estado, setEstado] = useState<EstadoIA>({ iaDisponible: true, circuitos: {} });
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    const cargar = async () => {
      try {
        const res = await fetch("/api/estado-ia");
        if (!res.ok) return;
        const body = await res.json();
        if (vivo && body.data) setEstado(body.data as EstadoIA);
      } catch {
        /* ante un fallo del check, se asume disponible (no bloquear) */
      } finally {
        if (vivo) setCargando(false);
      }
    };
    cargar();
    const t = setInterval(cargar, REFRESCO_MS);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, []);

  return { ...estado, cargando };
}
