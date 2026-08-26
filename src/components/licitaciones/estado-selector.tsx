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
import { ESTADOS_LICITACION } from "@/lib/validations/licitacion";
import type { EstadoLicitacion } from "@/types";

const ESTADO_LABELS: Record<EstadoLicitacion, string> = {
  NUEVA: "Nueva",
  ANALISIS: "Análisis",
  PREPARACION: "Preparación",
  ENVIADA: "Enviada",
  SEGUIMIENTO: "Seguimiento",
  CERRADA: "Cerrada",
};

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
      const json = await res.json().catch(() => null);
      const gate = json?.error?.details?.gate ?? json?.gate;
      if (res.status === 409 && gate) {
        const { rojos, amarillosCriticos, pendientesLiberacion } = gate;
        toast.error("No se puede marcar como enviada", {
          description: `Faltan: ${rojos} requisito(s) en rojo, ${amarillosCriticos} crítico(s) en amarillo, ${pendientesLiberacion} punto(s) del checklist de liberación. Revisa las pestañas Auditoría y Liberación.`,
        });
      } else {
        toast.error("No se pudo cambiar el estado", { description: json?.error?.message ?? json?.error });
      }
      return;
    }

    toast.success(`Estado actualizado a "${ESTADO_LABELS[nuevo as EstadoLicitacion]}"`);
    startTransition(() => router.refresh());
  }

  return (
    <Select value={estado} onValueChange={handleChange} disabled={isPending}>
      <SelectTrigger className="w-44">
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
  );
}
