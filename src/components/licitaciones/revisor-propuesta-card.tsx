"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";

interface UsuarioOrg {
  id: string;
  nombre: string;
}

export function RevisorPropuestaCard({
  licitacionId,
  createdBy,
  revisorId,
  revisadoAt,
  onUpdated,
}: {
  licitacionId: string;
  createdBy: string | null;
  revisorId: string | null;
  revisadoAt: string | null;
  onUpdated: () => void;
}) {
  const [usuarios, setUsuarios] = useState<UsuarioOrg[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    fetch("/api/organizacion/usuarios")
      .then((res) => res.json())
      .then((json) => setUsuarios(json.data ?? []));
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  async function asignar(revisor_id: string) {
    setGuardando(true);
    const res = await fetch(`/api/licitaciones/${licitacionId}/propuesta-tecnica/revisor`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "asignar", revisor_id }),
    });
    const json = await res.json();
    setGuardando(false);
    if (!res.ok) {
      toast.error("No se pudo asignar el revisor", { description: json.error?.message ?? json.error });
      return;
    }
    toast.success("Revisor asignado");
    onUpdated();
  }

  async function confirmar() {
    setGuardando(true);
    const res = await fetch(`/api/licitaciones/${licitacionId}/propuesta-tecnica/revisor`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "confirmar" }),
    });
    const json = await res.json();
    setGuardando(false);
    if (!res.ok) {
      toast.error("No se pudo confirmar la revisión", { description: json.error?.message ?? json.error });
      return;
    }
    toast.success("Revisión confirmada");
    onUpdated();
  }

  const opciones = usuarios.filter((u) => u.id !== createdBy);

  return (
    <Card className="h-fit lg:sticky lg:top-4">
      <CardHeader>
        <CardTitle className="text-sm">Doble check — revisor</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        <p className="text-xs text-muted-foreground">
          Quien elaboró la propuesta no debe ser quien la valida (Paso 17).
        </p>
        <Select value={revisorId ?? "__sin_asignar__"} onValueChange={(v) => v && v !== "__sin_asignar__" && asignar(v)}>
          <SelectTrigger size="sm" className="w-full">
            <SelectValue>
              {(v: string | null) =>
                !v || v === "__sin_asignar__"
                  ? "Asignar revisor"
                  : (usuarios.find((u) => u.id === v)?.nombre ?? "Asignar revisor")
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__sin_asignar__">Sin asignar</SelectItem>
            {opciones.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {revisadoAt ? (
          <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
            <CheckCircle2 className="size-3.5" />
            Revisada el {new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(new Date(revisadoAt))}
          </p>
        ) : (
          revisorId && (
            <Button
              size="sm"
              variant="outline"
              disabled={guardando || userId !== revisorId}
              onClick={confirmar}
            >
              <ShieldCheck className="size-3.5" />
              {userId === revisorId ? "Confirmar revisión" : "Solo el revisor puede confirmar"}
            </Button>
          )
        )}
      </CardContent>
    </Card>
  );
}
