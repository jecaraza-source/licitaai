"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { CalendarClock, FileText, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ESTADOS_ID,
  MODALIDADES_PROCEDIMIENTO,
  SISTEMAS,
  TIPOS_LICITACION,
  licitacionSchema,
  type LicitacionFormValues,
  type LicitacionInput,
} from "@/lib/validations/licitacion";

const TIPO_LABELS: Record<string, string> = {
  ADQUISICION: "Adquisición",
  SERVICIOS: "Servicios",
  OBRA_PUBLICA: "Obra pública",
};

const MODALIDAD_LABELS: Record<string, string> = {
  ABIERTA: "Abierta (licitación pública)",
  RESTRINGIDA: "Restringida",
  INVITACION_TRES: "Invitación a Cuando Menos Tres Personas",
};

const SISTEMA_POR_ESTADO: Record<string, (typeof SISTEMAS)[number]> = {
  FEDERAL: "COMPRANET",
  EDOMEX: "EDCA",
  CDMX: "SCA",
};

const DATE_FIELDS = [
  { name: "fecha_publicacion", label: "Publicación" },
  { name: "fecha_junta_aclaraciones", label: "Junta de aclaraciones" },
  { name: "fecha_visita", label: "Visita a instalaciones" },
  { name: "fecha_entrega_propuesta", label: "Entrega de propuesta" },
  { name: "fecha_apertura_tecnica", label: "Apertura técnica" },
  { name: "fecha_apertura_economica", label: "Apertura económica" },
  { name: "fecha_fallo", label: "Fallo" },
] as const;

export function LicitacionForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<LicitacionFormValues, unknown, LicitacionInput>({
    resolver: zodResolver(licitacionSchema),
    defaultValues: {
      estado_id: "FEDERAL",
      sistema: "COMPRANET",
      tipo: "ADQUISICION",
      modalidad_procedimiento: "ABIERTA",
    },
  });

  const estadoId = watch("estado_id");

  async function onSubmit(values: LicitacionInput) {
    setLoading(true);
    const res = await fetch("/api/licitaciones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const json = await res.json();
    setLoading(false);

    if (!res.ok) {
      toast.error("No se pudo crear la licitación", {
        description: typeof json.error === "string" ? json.error : "Revisa los campos.",
      });
      return;
    }

    toast.success("Licitación creada");
    router.push(`/licitaciones/${json.data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex max-w-3xl flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="flex size-8 items-center justify-center rounded-lg bg-secondary text-primary">
              <FileText className="size-4" />
            </span>
            Datos generales
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="numero_expediente">Número de expediente</Label>
          <Input id="numero_expediente" className="h-11" {...register("numero_expediente")} />
          {errors.numero_expediente && (
            <p className="text-sm text-destructive">{errors.numero_expediente.message}</p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="institucion">Institución convocante</Label>
          <Input id="institucion" className="h-11" {...register("institucion")} />
          {errors.institucion && (
            <p className="text-sm text-destructive">{errors.institucion.message}</p>
          )}
        </div>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="titulo">Título</Label>
          <Input id="titulo" className="h-11" {...register("titulo")} />
          {errors.titulo && <p className="text-sm text-destructive">{errors.titulo.message}</p>}
        </div>

        <div className="flex items-start gap-2.5 rounded-lg border bg-secondary/30 p-3 sm:col-span-2">
          <Checkbox
            id="es_investigacion_mercado"
            className="mt-0.5"
            onCheckedChange={(checked) => setValue("es_investigacion_mercado", checked === true)}
          />
          <div>
            <Label htmlFor="es_investigacion_mercado" className="font-normal">
              Es una investigación de mercado o solicitud de cotización
            </Label>
            <p className="text-xs text-muted-foreground">
              Usa el checklist de intake simplificado en vez del checklist de liberación completo.
            </p>
          </div>
        </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="flex size-8 items-center justify-center rounded-lg bg-secondary text-primary">
              <Layers className="size-4" />
            </span>
            Clasificación y monto
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label>Tipo</Label>
          <Select
            defaultValue="ADQUISICION"
            onValueChange={(v) => setValue("tipo", v as LicitacionInput["tipo"])}
          >
            <SelectTrigger className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIPOS_LICITACION.map((t) => (
                <SelectItem key={t} value={t}>
                  {TIPO_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label>Modalidad del procedimiento</Label>
          <Select
            defaultValue="ABIERTA"
            onValueChange={(v) =>
              setValue("modalidad_procedimiento", v as LicitacionInput["modalidad_procedimiento"])
            }
          >
            <SelectTrigger className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODALIDADES_PROCEDIMIENTO.map((m) => (
                <SelectItem key={m} value={m}>
                  {MODALIDAD_LABELS[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Determina qué documentación de la convocante se pide en la pestaña Documentos
            (invitación a participar, solicitud de estudio de mercado).
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="monto_maximo">Monto máximo (MXN)</Label>
          <Input id="monto_maximo" className="h-11" type="number" step="0.01" {...register("monto_maximo")} />
        </div>

        <div className="hidden sm:block" aria-hidden="true" />

        <div className="flex flex-col gap-2">
          <Label>Jurisdicción</Label>
          <Select
            defaultValue="FEDERAL"
            onValueChange={(v) => {
              if (!v) return;
              setValue("estado_id", v as LicitacionInput["estado_id"]);
              setValue("sistema", SISTEMA_POR_ESTADO[v]);
            }}
          >
            <SelectTrigger className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ESTADOS_ID.map((e) => (
                <SelectItem key={e} value={e}>
                  {e}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label>Sistema de publicación</Label>
          <Input className="h-11" value={SISTEMA_POR_ESTADO[estadoId] ?? ""} disabled readOnly />
        </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="flex size-8 items-center justify-center rounded-lg bg-secondary text-primary">
              <CalendarClock className="size-4" />
            </span>
            Fechas del procedimiento
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {DATE_FIELDS.map((field) => (
              <div key={field.name} className="flex flex-col gap-2">
                <Label htmlFor={field.name}>{field.label}</Label>
                <Input id={field.name} className="h-11" type="datetime-local" {...register(field.name)} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse justify-end gap-2 sm:flex-row">
        <Button
          type="button"
          variant="outline"
          className="h-11"
          onClick={() => router.push("/licitaciones")}
        >
          Cancelar
        </Button>
        <Button type="submit" className="h-11" disabled={loading}>
          {loading ? "Guardando…" : "Crear licitación"}
        </Button>
      </div>
    </form>
  );
}
