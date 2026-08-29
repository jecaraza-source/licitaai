"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { EjeViabilidad, RespuestaViabilidad } from "@/types";

export interface ViabilidadData {
  respuestas_json: RespuestaViabilidad[];
  decision: "GO" | "NO_GO" | null;
  decidido_at: string | null;
}

export function useViabilidadTab(licitacionId: string) {
  const [data, setData] = useState<ViabilidadData | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    fetch(`/api/licitaciones/${licitacionId}/viabilidad`)
      .then((res) => res.json())
      .then((json) => setData(json.data));
  }, [licitacionId]);

  function actualizarRespuesta(eje: EjeViabilidad, patch: Partial<RespuestaViabilidad>) {
    setData((prev) =>
      prev
        ? {
            ...prev,
            respuestas_json: prev.respuestas_json.map((r) =>
              r.eje === eje ? { ...r, ...patch } : r,
            ),
          }
        : prev,
    );
  }

  async function guardar(decision?: "GO" | "NO_GO") {
    if (!data) return;
    setGuardando(true);
    const res = await fetch(`/api/licitaciones/${licitacionId}/viabilidad`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        respuestas_json: data.respuestas_json,
        decision: decision ?? data.decision,
      }),
    });
    setGuardando(false);
    if (!res.ok) {
      toast.error("No se pudo guardar la viabilidad");
      return;
    }
    const json = await res.json();
    setData((prev) => (prev ? { ...prev, decision: json.data.decision, decidido_at: json.data.decidido_at } : prev));
    toast.success(decision ? `Decisión registrada: ${decision === "GO" ? "Go" : "No-Go"}` : "Guardado");
  }

  return { data, guardando, actualizarRespuesta, guardar };
}
