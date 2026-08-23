"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { AsignacionResponsabilidad, FuncionProcedimiento } from "@/types";

interface UsuarioOrg {
  id: string;
  nombre: string;
}

const FUNCION_LABELS: Record<FuncionProcedimiento, string> = {
  COORDINADOR: "Coordinador del procedimiento",
  JURIDICO: "Jurídico/Administrativo",
  TECNICO: "Técnico",
  COMERCIAL: "Comercial/Compras",
  FINANZAS: "Finanzas",
  DIRECCION: "Dirección",
  OPERADOR_COMPRAS_MX: "Operador Compras MX",
  REVISOR: "Revisor",
};

export function ResponsabilidadesCard({ licitacionId }: { licitacionId: string }) {
  const [asignaciones, setAsignaciones] = useState<AsignacionResponsabilidad[] | null>(null);
  const [usuarios, setUsuarios] = useState<UsuarioOrg[]>([]);

  useEffect(() => {
    fetch(`/api/licitaciones/${licitacionId}/responsabilidades`)
      .then((res) => res.json())
      .then((json) => setAsignaciones(json.data?.asignaciones_json ?? []));
    fetch("/api/organizacion/usuarios")
      .then((res) => res.json())
      .then((json) => setUsuarios(json.data ?? []));
  }, [licitacionId]);

  async function asignar(funcion: FuncionProcedimiento, usuario_id: string | null) {
    const next = (asignaciones ?? []).map((a) => (a.funcion === funcion ? { ...a, usuario_id } : a));
    setAsignaciones(next);
    const res = await fetch(`/api/licitaciones/${licitacionId}/responsabilidades`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asignaciones_json: next }),
    });
    if (!res.ok) toast.error("No se pudo guardar la asignación");
  }

  if (asignaciones === null) {
    return <Skeleton className="h-48 w-full" />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Responsabilidades internas</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {asignaciones.map((a) => (
          <div key={a.funcion} className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">{FUNCION_LABELS[a.funcion]}</label>
            <Select
              value={a.usuario_id ?? "__sin_asignar__"}
              onValueChange={(v) => asignar(a.funcion, v === "__sin_asignar__" ? null : v)}
            >
              <SelectTrigger size="sm" className="w-full">
                <SelectValue>
                  {(v: string | null) =>
                    !v || v === "__sin_asignar__"
                      ? "Sin asignar"
                      : (usuarios.find((u) => u.id === v)?.nombre ?? "Sin asignar")
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__sin_asignar__">Sin asignar</SelectItem>
                {usuarios.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
