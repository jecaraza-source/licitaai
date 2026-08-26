"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { LicitacionJerarquia, RolJerarquico, StaffOrg } from "@/types";

type Nivel = "ejecutor" | "integrador" | "supervisor";

const NIVELES: { nivel: Nivel; rol: RolJerarquico; label: string }[] = [
  { nivel: "ejecutor", rol: "EJECUTOR", label: "Ejecutor" },
  { nivel: "integrador", rol: "INTEGRADOR", label: "Integrador" },
  { nivel: "supervisor", rol: "SUPERVISOR", label: "Supervisor" },
];

function formatFechaHora(fecha: string) {
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(fecha),
  );
}

export function JerarquiaAutorizacionCard({
  licitacionId,
  onUpdated,
}: {
  licitacionId: string;
  onUpdated?: () => void;
}) {
  const [jerarquia, setJerarquia] = useState<LicitacionJerarquia | null>(null);
  const [staff, setStaff] = useState<StaffOrg[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [procesando, setProcesando] = useState<Nivel | null>(null);

  function cargar() {
    fetch(`/api/licitaciones/${licitacionId}/jerarquia`)
      .then((res) => res.json())
      .then((json) => {
        const { userId: idUsuario, ...jerarquiaData } = json.data ?? {};
        setJerarquia(jerarquiaData as LicitacionJerarquia);
        setUserId(idUsuario ?? null);
      });
  }

  useEffect(() => {
    cargar();
    fetch("/api/organizacion/staff")
      .then((res) => res.json())
      .then((json) => setStaff(json.data ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [licitacionId]);

  async function asignar(nivel: Nivel, usuario_id: string | null) {
    const res = await fetch(`/api/licitaciones/${licitacionId}/jerarquia`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nivel, usuario_id }),
    });
    const json = await res.json();
    if (!res.ok) {
      toast.error("No se pudo asignar", { description: json.error?.message ?? json.error });
      return;
    }
    setJerarquia(json.data);
    onUpdated?.();
  }

  async function autorizar(nivel: Nivel) {
    setProcesando(nivel);
    const res = await fetch(`/api/licitaciones/${licitacionId}/jerarquia`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nivel }),
    });
    const json = await res.json();
    setProcesando(null);
    if (!res.ok) {
      toast.error("No se pudo autorizar", { description: json.error?.message ?? json.error });
      return;
    }
    setJerarquia(json.data);
    toast.success(`${nivel[0].toUpperCase()}${nivel.slice(1)} autorizó`);
    onUpdated?.();
  }

  if (!jerarquia) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Cadena de autorización</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto pb-1">
          <div className="flex min-w-max gap-0">
            {NIVELES.map((n, i) => {
              const asignadoId = jerarquia[`${n.nivel}_id`] as string | null;
              const autorizadoAt = jerarquia[`${n.nivel}_autorizado_at`] as string | null;
              const anterior = i > 0 ? NIVELES[i - 1] : null;
              const anteriorAutorizado = anterior
                ? !!jerarquia[`${anterior.nivel}_autorizado_at`]
                : true;
              const esMiTurno = !!asignadoId && userId === asignadoId && !autorizadoAt;
              const puedeAutorizar = esMiTurno && anteriorAutorizado;
              const opciones = staff.filter((s) => s.rol_jerarquico === n.rol);

              const estado: "completada" | "siguiente" | "pendiente" = autorizadoAt
                ? "completada"
                : anteriorAutorizado
                  ? "siguiente"
                  : "pendiente";

              return (
                <div key={n.nivel} className="flex w-52 flex-col items-center first:w-44 last:w-44">
                  <div className="flex w-full items-center">
                    <div
                      className={cn(
                        "h-0.5 flex-1",
                        i === 0
                          ? "invisible"
                          : anteriorAutorizado
                            ? "bg-primary"
                            : "bg-border",
                      )}
                    />
                    <div className="relative flex shrink-0 items-center justify-center">
                      {estado === "siguiente" && (
                        <span className="absolute inline-flex size-8 animate-ping rounded-full bg-primary/30" />
                      )}
                      <div
                        className={cn(
                          "relative flex size-8 shrink-0 items-center justify-center rounded-full border-2",
                          estado === "completada"
                            ? "border-primary bg-primary text-primary-foreground"
                            : estado === "siguiente"
                              ? "border-primary bg-background text-primary"
                              : "border-dashed border-border bg-background text-muted-foreground/50",
                        )}
                      >
                        {estado === "completada" ? (
                          <Check className="size-4" />
                        ) : (
                          <span className="text-xs font-semibold">{i + 1}</span>
                        )}
                      </div>
                    </div>
                    <div
                      className={cn(
                        "h-0.5 flex-1",
                        i === NIVELES.length - 1
                          ? "invisible"
                          : autorizadoAt
                            ? "bg-primary"
                            : "bg-border",
                      )}
                    />
                  </div>

                  <div className="mt-2 flex w-full flex-col items-center gap-1.5 px-1 text-center">
                    <p className="text-xs font-semibold">{n.label}</p>
                    <Select
                      value={asignadoId ?? "__sin_asignar__"}
                      onValueChange={(v) =>
                        asignar(n.nivel, v === "__sin_asignar__" ? null : v)
                      }
                    >
                      <SelectTrigger size="sm" className="w-full text-xs">
                        <SelectValue>
                          {(v: string | null) =>
                            !v || v === "__sin_asignar__"
                              ? "Sin asignar"
                              : (staff.find((s) => s.id === v)?.nombre ?? "Sin asignar")
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__sin_asignar__">Sin asignar</SelectItem>
                        {opciones.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {autorizadoAt ? (
                      <p className="text-[11px] text-emerald-600">
                        Autorizó · {formatFechaHora(autorizadoAt)}
                      </p>
                    ) : asignadoId ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        disabled={!puedeAutorizar || procesando === n.nivel}
                        onClick={() => autorizar(n.nivel)}
                      >
                        <ShieldCheck className="size-3.5" />
                        {esMiTurno
                          ? anteriorAutorizado
                            ? "Autorizar"
                            : "Falta nivel anterior"
                          : "Pendiente"}
                      </Button>
                    ) : (
                      <p className="text-[11px] text-muted-foreground/60">Sin asignar</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
