"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Mail, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { RolJerarquico, StaffOrg } from "@/types";

const NIVELES: { rol: RolJerarquico; label: string; funcion: string }[] = [
  {
    rol: "EJECUTOR",
    label: "Ejecutor",
    funcion: "Prepara la licitación: sube documentos, arma la propuesta y avisa cuando su parte está lista.",
  },
  {
    rol: "INTEGRADOR",
    label: "Integrador",
    funcion: "Revisa y consolida el trabajo del Ejecutor — es el segundo filtro antes de escalar.",
  },
  {
    rol: "SUPERVISOR",
    label: "Supervisor",
    funcion: "Da la autorización final. Sin su visto bueno, la licitación no puede marcarse como enviada.",
  },
];

const ROL_BADGE: Record<RolJerarquico, string> = {
  EJECUTOR: "bg-blue-500/10 text-blue-700",
  INTEGRADOR: "bg-amber-500/10 text-amber-700",
  SUPERVISOR: "bg-emerald-500/10 text-emerald-700",
};

interface InvitacionPendiente {
  id: string;
  email: string;
  rol_jerarquico: RolJerarquico;
  expires_at: string;
}

export function StaffJerarquiaCard() {
  const [staff, setStaff] = useState<StaffOrg[] | null>(null);
  const [invitaciones, setInvitaciones] = useState<InvitacionPendiente[]>([]);
  const [puedeInvitar, setPuedeInvitar] = useState(false);
  const [email, setEmail] = useState("");
  const [rolNuevo, setRolNuevo] = useState<RolJerarquico>("EJECUTOR");
  const [invitando, setInvitando] = useState(false);

  function cargar() {
    fetch("/api/organizacion/staff")
      .then((res) => res.json())
      .then((json) => {
        setStaff(json.data?.miembros ?? []);
        setInvitaciones(json.data?.invitacionesPendientes ?? []);
        setPuedeInvitar(!!json.data?.puedeInvitar);
      });
  }

  useEffect(() => {
    cargar();
  }, []);

  async function actualizarRol(userId: string, rol_jerarquico: RolJerarquico | null) {
    setStaff((prev) =>
      prev ? prev.map((s) => (s.id === userId ? { ...s, rol_jerarquico } : s)) : prev,
    );
    const res = await fetch(`/api/organizacion/staff/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rol_jerarquico }),
    });
    if (!res.ok) {
      toast.error("No se pudo actualizar el rango");
      cargar();
    }
  }

  async function invitar() {
    if (!email.includes("@")) {
      toast.error("Ingresa un correo válido");
      return;
    }
    setInvitando(true);
    const res = await fetch("/api/organizacion/staff/invitar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, rol_jerarquico: rolNuevo }),
    });
    const json = await res.json();
    setInvitando(false);
    if (!res.ok) {
      toast.error("No se pudo enviar la invitación", { description: json.error?.message });
      return;
    }
    toast.success(`Invitación enviada a ${email}`);
    setEmail("");
    cargar();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Staff y cadena de autorización</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="overflow-x-auto pb-1">
          <div className="flex min-w-max items-stretch gap-0">
            {NIVELES.map((nivel, i) => (
              <div key={nivel.rol} className="flex items-start">
                <div className="flex w-52 flex-col gap-1.5 rounded-lg border p-3">
                  <span
                    className={cn(
                      "w-fit rounded-full px-2 py-0.5 text-[11px] font-semibold",
                      ROL_BADGE[nivel.rol],
                    )}
                  >
                    {nivel.label}
                  </span>
                  <p className="text-xs text-muted-foreground">{nivel.funcion}</p>
                </div>
                {i < NIVELES.length - 1 && (
                  <ArrowRight className="mt-6 mx-2 size-5 shrink-0 text-muted-foreground" />
                )}
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Ningún procedimiento puede marcarse como enviado sin la autorización del Supervisor,
            y cada nivel solo puede autorizar después de que el anterior ya lo hizo.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground">Staff de la organización</p>
          {staff === null ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : staff.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aún no hay staff registrado.</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {staff.map((s) => (
                <li key={s.id} className="flex items-center gap-2 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{s.nombre}</p>
                    {s.email && (
                      <p className="truncate text-xs text-muted-foreground">{s.email}</p>
                    )}
                  </div>
                  {puedeInvitar ? (
                    <Select
                      value={s.rol_jerarquico ?? "__sin_rango__"}
                      onValueChange={(v) =>
                        actualizarRol(s.id, v === "__sin_rango__" ? null : (v as RolJerarquico))
                      }
                    >
                      <SelectTrigger size="sm" className="w-36 text-xs">
                        <SelectValue>
                          {(v: string | null) =>
                            !v || v === "__sin_rango__"
                              ? "Sin rango"
                              : (NIVELES.find((n) => n.rol === v)?.label ?? v)
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__sin_rango__">Sin rango</SelectItem>
                        {NIVELES.map((n) => (
                          <SelectItem key={n.rol} value={n.rol}>
                            {n.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="outline" className="text-xs">
                      {s.rol_jerarquico
                        ? (NIVELES.find((n) => n.rol === s.rol_jerarquico)?.label ?? s.rol_jerarquico)
                        : "Sin rango"}
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {invitaciones.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground">Invitaciones pendientes</p>
            <ul className="flex flex-col divide-y">
              {invitaciones.map((inv) => (
                <li key={inv.id} className="flex items-center gap-2 py-2 text-sm">
                  <Mail className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{inv.email}</span>
                  <Badge variant="outline" className="text-xs">
                    {NIVELES.find((n) => n.rol === inv.rol_jerarquico)?.label ?? inv.rol_jerarquico}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        )}

        {puedeInvitar && (
          <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3">
            <Label className="text-xs text-muted-foreground">Invitar a alguien nuevo</Label>
            <div className="flex flex-wrap gap-2">
              <Input
                type="email"
                placeholder="correo@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="min-w-48 flex-1"
              />
              <Select value={rolNuevo} onValueChange={(v) => v && setRolNuevo(v as RolJerarquico)}>
                <SelectTrigger size="sm" className="w-36">
                  <SelectValue>{() => NIVELES.find((n) => n.rol === rolNuevo)?.label}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {NIVELES.map((n) => (
                    <SelectItem key={n.rol} value={n.rol}>
                      {n.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" onClick={invitar} disabled={invitando}>
                <UserPlus className="size-3.5" />
                {invitando ? "Enviando…" : "Invitar"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
