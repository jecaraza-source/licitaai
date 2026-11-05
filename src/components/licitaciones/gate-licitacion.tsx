"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSearchParams } from "next/navigation";
import type { GateStatus } from "@/lib/liberacion";
import { compuertaRelevante, pasosPendientes, type PasoPendiente } from "@/lib/siguiente-paso";
import type { EstadoLicitacion } from "@/types";

// Una sola lectura de la compuerta de liberación para toda la ficha: la usan
// el panel "Siguiente paso" y las insignias de las pestañas. Se vuelve a leer
// al cambiar de pestaña, al volver a la ventana y cuando Liberación avisa de un
// cambio (EVENTO_GATE_CAMBIO), para que los números no se queden viejos.
export const EVENTO_GATE_CAMBIO = "licitacion:gate-cambio";

interface GateLicitacion {
  /** false cuando la licitación ya se envió: no hay compuerta que mostrar. */
  activo: boolean;
  gate: GateStatus | null;
  pasos: PasoPendiente[];
  error: boolean;
  recargar: () => void;
}

const GateContext = createContext<GateLicitacion | null>(null);

export function GateLicitacionProvider({
  licitacionId,
  estado,
  children,
}: {
  licitacionId: string;
  estado: EstadoLicitacion;
  children: ReactNode;
}) {
  const activo = compuertaRelevante(estado);
  const tab = useSearchParams().get("tab");
  const [gate, setGate] = useState<GateStatus | null>(null);
  const [error, setError] = useState(false);
  // Si dos lecturas se cruzan, solo vale la última que se pidió.
  const pedido = useRef(0);

  const recargar = useCallback(() => {
    const mio = ++pedido.current;
    fetch(`/api/licitaciones/${licitacionId}/liberacion`)
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
      .then((json) => {
        if (mio !== pedido.current) return;
        setGate(json.data ?? null);
        setError(false);
      })
      .catch(() => {
        if (mio === pedido.current) setError(true);
      });
  }, [licitacionId]);

  useEffect(() => {
    if (activo) recargar();
  }, [activo, recargar, tab]);

  useEffect(() => {
    if (!activo) return;
    window.addEventListener("focus", recargar);
    window.addEventListener(EVENTO_GATE_CAMBIO, recargar);
    return () => {
      window.removeEventListener("focus", recargar);
      window.removeEventListener(EVENTO_GATE_CAMBIO, recargar);
    };
  }, [activo, recargar]);

  const valor = useMemo<GateLicitacion>(
    () => ({ activo, gate, pasos: gate ? pasosPendientes(gate) : [], error, recargar }),
    [activo, gate, error, recargar],
  );

  return <GateContext.Provider value={valor}>{children}</GateContext.Provider>;
}

const SIN_GATE: GateLicitacion = { activo: false, gate: null, pasos: [], error: false, recargar: () => {} };

export function useGateLicitacion(): GateLicitacion {
  return useContext(GateContext) ?? SIN_GATE;
}
