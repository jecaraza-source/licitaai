"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
    defaultValues: { estado_id: "FEDERAL", sistema: "COMPRANET", tipo: "ADQUISICION" },
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
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="numero_expediente">Número de expediente</Label>
          <Input id="numero_expediente" {...register("numero_expediente")} />
          {errors.numero_expediente && (
            <p className="text-sm text-destructive">{errors.numero_expediente.message}</p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="institucion">Institución convocante</Label>
          <Input id="institucion" {...register("institucion")} />
          {errors.institucion && (
            <p className="text-sm text-destructive">{errors.institucion.message}</p>
          )}
        </div>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="titulo">Título</Label>
          <Input id="titulo" {...register("titulo")} />
          {errors.titulo && <p className="text-sm text-destructive">{errors.titulo.message}</p>}
        </div>

        <div className="flex flex-col gap-2">
          <Label>Tipo</Label>
          <Select
            defaultValue="ADQUISICION"
            onValueChange={(v) => setValue("tipo", v as LicitacionInput["tipo"])}
          >
            <SelectTrigger>
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

        <div className="flex flex-col gap-2">
          <Label htmlFor="monto_maximo">Monto máximo (MXN)</Label>
          <Input id="monto_maximo" type="number" step="0.01" {...register("monto_maximo")} />
        </div>

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
            <SelectTrigger>
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
          <Input value={SISTEMA_POR_ESTADO[estadoId] ?? ""} disabled readOnly />
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-medium">Fechas del procedimiento</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {DATE_FIELDS.map((field) => (
            <div key={field.name} className="flex flex-col gap-2">
              <Label htmlFor={field.name}>{field.label}</Label>
              <Input id={field.name} type="datetime-local" {...register(field.name)} />
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/licitaciones")}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? "Guardando…" : "Crear licitación"}
        </Button>
      </div>
    </form>
  );
}
