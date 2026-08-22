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
      toast.error("No se pudo cambiar el estado");
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
