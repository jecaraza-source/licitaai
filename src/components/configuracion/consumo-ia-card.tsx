"use client";

import { useEffect, useState } from "react";
import { Gauge } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatoUsd,
  nivelUso,
  porcentajeUso,
  topesSchema,
  type EstadoConsumoIA,
  type NivelUso,
} from "@/lib/ia-topes";

const COLOR_BARRA: Record<NivelUso, string> = {
  normal: "bg-primary",
  atencion: "bg-amber-500",
  critico: "bg-orange-600",
  agotado: "bg-destructive",
};

function Medidor({
  titulo,
  gasto,
  tope,
  umbrales,
}: {
  titulo: string;
  gasto: number;
  tope: number;
  umbrales: number[];
}) {
  const pct = porcentajeUso(gasto, tope);
  const nivel = nivelUso(pct, umbrales);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{titulo}</span>
        <span className="text-sm tabular-nums text-muted-foreground">
          {formatoUsd(gasto)} de {formatoUsd(tope)}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={titulo}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, Math.round(pct))}
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className={`h-full rounded-full transition-all ${COLOR_BARRA[nivel]}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {nivel === "agotado"
          ? "Tope alcanzado"
          : nivel === "critico"
            ? `${pct}% usado — muy cerca del tope`
            : `${pct}% usado`}
      </p>
    </div>
  );
}

export function ConsumoIaCard() {
  // undefined = cargando, null = sin permiso o error (la tarjeta no se muestra)
  const [estado, setEstado] = useState<EstadoConsumoIA | null | undefined>(undefined);
  const [cuota, setCuota] = useState("");
  const [diario, setDiario] = useState("");
  const [activos, setActivos] = useState(false);
  const [guardando, setGuardando] = useState(false);

  function cargar(e: EstadoConsumoIA) {
    setEstado(e);
    setCuota(String(e.cuota_mensual_usd));
    setDiario(String(e.limite_diario_usd));
    setActivos(e.topes_usd_activos);
  }

  useEffect(() => {
    fetch("/api/organizacion/ia-consumo")
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => (body?.data ? cargar(body.data as EstadoConsumoIA) : setEstado(null)))
      .catch(() => setEstado(null));
  }, []);

  if (estado === null) return null;

  async function guardar() {
    if (!estado) return;
    const parsed = topesSchema.safeParse({
      organization_id: estado.organization_id,
      cuota_mensual_usd: Number(cuota),
      limite_diario_usd: Number(diario),
      topes_usd_activos: activos,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Datos inválidos");
      return;
    }
    setGuardando(true);
    try {
      const res = await fetch("/api/admin/ia-topes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error("No se guardaron los topes", { description: body?.error });
        return;
      }
      cargar({
        ...estado,
        cuota_mensual_usd: parsed.data.cuota_mensual_usd,
        limite_diario_usd: parsed.data.limite_diario_usd,
        topes_usd_activos: parsed.data.topes_usd_activos,
      });
      toast.success("Topes de IA guardados");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-secondary text-primary">
            <Gauge className="size-4" />
          </span>
          Consumo de IA
        </CardTitle>
        <CardDescription>
          Gasto estimado de los proveedores de IA de esta organización. El día y el mes se miden en
          hora de Ciudad de México.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {estado === undefined ? (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : (
          <>
            <div className="grid gap-6 sm:grid-cols-2">
              <Medidor
                titulo="Hoy"
                gasto={estado.gasto_hoy_usd}
                tope={estado.limite_diario_usd}
                umbrales={estado.alertas_umbral_pct}
              />
              <Medidor
                titulo="Este mes"
                gasto={estado.gasto_mes_usd}
                tope={estado.cuota_mensual_usd}
                umbrales={estado.alertas_umbral_pct}
              />
            </div>

            <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
              {estado.topes_usd_activos
                ? "Los topes están activos: al alcanzarlos se bloquean las nuevas operaciones de IA hasta que pase el periodo o se amplíe el tope. La operación que cruza el tope termina; las siguientes se bloquean."
                : "Los topes no están activos: el consumo se muestra pero no se bloquea. Solo rige el límite diario de tokens."}
            </p>

            {estado.puede_editar ? (
              <div className="flex flex-col gap-4 border-t pt-4">
                <p className="text-sm font-medium">Topes de esta organización</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="ia-cuota">Cuota mensual (USD)</Label>
                    <Input
                      id="ia-cuota"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      value={cuota}
                      onChange={(e) => setCuota(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="ia-diario">Límite diario (USD)</Label>
                    <Input
                      id="ia-diario"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      value={diario}
                      onChange={(e) => setDiario(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="ia-activos"
                    checked={activos}
                    onCheckedChange={(c) => setActivos(c === true)}
                  />
                  <Label htmlFor="ia-activos">Bloquear la IA al alcanzar los topes</Label>
                </div>
                <div>
                  <Button onClick={guardar} disabled={guardando}>
                    {guardando ? "Guardando…" : "Guardar topes"}
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Los topes los define el equipo de la plataforma. Si necesitas ampliarlos, solicítalo
                a tu administrador de LicitaAI.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
