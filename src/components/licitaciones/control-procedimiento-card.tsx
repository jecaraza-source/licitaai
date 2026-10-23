"use client";

import { useState } from "react";
import { toast } from "sonner";
import { TriangleAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CAMPOS_EVENTO_EDITABLES,
  EVENTOS_CRITICOS,
  validarCierreInterno,
  type CampoEvento,
  type CampoEventoEditable,
} from "@/lib/compras-mx";

// Pasos 1 y 3 del proceso operativo de Compras MX: datos de registro del
// procedimiento, cierre interno anticipado y calendario con acción interna.

export interface ControlProcedimiento {
  unidad_compradora: string | null;
  numero_interno: string | null;
  enlace_compras_mx: string | null;
  fecha_cierre_interno: string | null;
  acciones_internas: Partial<Record<CampoEvento, string>>;
}

type Fechas = Record<CampoEvento, string | null>;

const esEditable = (campo: CampoEvento): campo is CampoEventoEditable =>
  (CAMPOS_EVENTO_EDITABLES as readonly string[]).includes(campo);

function formatFechaHora(valor: string | null) {
  if (!valor) return "Por definir";
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date(valor));
}

/** ISO → valor de <input type="datetime-local"> en hora local. */
function aInputLocal(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ControlProcedimientoCard({
  licitacionId,
  inicial,
  fechas,
}: {
  licitacionId: string;
  inicial: ControlProcedimiento;
  fechas: Fechas;
}) {
  const [control, setControl] = useState(inicial);
  const [fechasEvento, setFechasEvento] = useState(fechas);

  async function guardar(cambios: Record<string, unknown>): Promise<boolean> {
    const res = await fetch(`/api/licitaciones/${licitacionId}/control`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cambios),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      toast.error(json?.error?.message ?? "No se pudo guardar");
      return false;
    }
    setControl((prev) => ({ ...prev, ...json.data }));
    setFechasEvento((prev) => {
      const siguiente = { ...prev };
      for (const campo of CAMPOS_EVENTO_EDITABLES) {
        if (campo in json.data) siguiente[campo] = json.data[campo];
      }
      return siguiente;
    });
    return true;
  }

  const errorCierre = validarCierreInterno(control.fecha_cierre_interno, fechasEvento.fecha_entrega_propuesta);
  const sinCierre = !control.fecha_cierre_interno && !!fechasEvento.fecha_entrega_propuesta;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Control del procedimiento</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="cp-unidad" className="text-xs text-muted-foreground">Unidad compradora</Label>
            <Input
              id="cp-unidad"
              defaultValue={control.unidad_compradora ?? ""}
              onBlur={(e) => e.target.value !== (control.unidad_compradora ?? "") && guardar({ unidad_compradora: e.target.value || null })}
              className="h-8 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="cp-interno" className="text-xs text-muted-foreground">Número interno de contratación</Label>
            <Input
              id="cp-interno"
              defaultValue={control.numero_interno ?? ""}
              onBlur={(e) => e.target.value !== (control.numero_interno ?? "") && guardar({ numero_interno: e.target.value || null })}
              className="h-8 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1 sm:col-span-2">
            <Label htmlFor="cp-enlace" className="text-xs text-muted-foreground">Enlace o referencia en Compras MX</Label>
            <div className="flex items-center gap-2">
              <Input
                id="cp-enlace"
                type="url"
                placeholder="https://comprasmx.buengobierno.gob.mx/…"
                defaultValue={control.enlace_compras_mx ?? ""}
                onBlur={(e) => e.target.value !== (control.enlace_compras_mx ?? "") && guardar({ enlace_compras_mx: e.target.value || null })}
                className="h-8 text-sm"
              />
              {control.enlace_compras_mx && (
                <a
                  href={control.enlace_compras_mx}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-xs font-medium text-primary underline-offset-4 hover:underline"
                >
                  Abrir
                </a>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="cp-cierre" className="text-xs text-muted-foreground">
            Cierre interno (debe ser anterior a la fecha límite oficial)
          </Label>
          <Input
            id="cp-cierre"
            type="datetime-local"
            defaultValue={aInputLocal(control.fecha_cierre_interno)}
            onBlur={(e) => {
              const nuevo = e.target.value ? new Date(e.target.value).toISOString() : null;
              if (nuevo !== control.fecha_cierre_interno) guardar({ fecha_cierre_interno: nuevo });
            }}
            className="h-8 w-60 text-sm"
          />
          {(errorCierre || sinCierre) && (
            <p className="flex items-center gap-1 text-xs font-medium text-amber-700">
              <TriangleAlert className="size-3.5" />
              {errorCierre ?? "Define un cierre interno anterior a la fecha límite de presentación."}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Calendario crítico</p>
          <p className="text-xs text-muted-foreground">
            La fecha límite de Compras MX es absoluta. Verifica cada fecha contra todos los
            documentos, no solo contra la pantalla principal del procedimiento.
          </p>
          <div className="flex flex-col divide-y rounded-lg border">
            {EVENTOS_CRITICOS.map((e) => (
              <div key={e.campo} className="grid grid-cols-1 items-center gap-2 p-2.5 sm:grid-cols-[1fr_1fr_1.4fr]">
                <span className="text-sm font-medium">{e.evento}</span>
                {esEditable(e.campo) ? (
                  <Input
                    type="datetime-local"
                    aria-label={`Fecha: ${e.evento}`}
                    defaultValue={aInputLocal(fechasEvento[e.campo])}
                    onBlur={(ev) => {
                      const nuevo = ev.target.value ? new Date(ev.target.value).toISOString() : null;
                      if (nuevo !== fechasEvento[e.campo]) guardar({ [e.campo]: nuevo });
                    }}
                    className="h-8 text-xs"
                  />
                ) : (
                  <span className="text-sm text-muted-foreground">{formatFechaHora(fechasEvento[e.campo])}</span>
                )}
                <Input
                  aria-label={`Acción interna: ${e.evento}`}
                  placeholder={e.accionSugerida}
                  defaultValue={control.acciones_internas[e.campo] ?? ""}
                  onBlur={(ev) => {
                    if (ev.target.value !== (control.acciones_internas[e.campo] ?? "")) {
                      guardar({ acciones_internas: { [e.campo]: ev.target.value } });
                    }
                  }}
                  className="h-8 text-xs"
                />
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
