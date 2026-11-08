"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, CalendarClock, Check, FileText, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  FECHAS_ALTA,
  PASOS_ALTA,
  ULTIMO_PASO_ALTA,
  hrefTrasCrear,
  primerPasoConError,
} from "@/lib/alta-licitacion";
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

export function LicitacionForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [paso, setPaso] = useState(0);
  const seccionesRef = useRef<Array<HTMLElement | null>>([]);
  const yaMontado = useRef(false);
  const {
    register,
    handleSubmit,
    trigger,
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
  const [expedienteCapturado, institucionCapturada] = watch(["numero_expediente", "institucion"]);

  // Al cambiar de paso el foco pasa a su sección, para que quien navega con
  // teclado o lector de pantalla no se quede en un botón que ya no está.
  useEffect(() => {
    if (!yaMontado.current) {
      yaMontado.current = true;
      return;
    }
    seccionesRef.current[paso]?.focus();
  }, [paso]);

  async function siguiente() {
    const campos = PASOS_ALTA[paso].campos as unknown as Array<keyof LicitacionFormValues>;
    const valido = await trigger(campos, { shouldFocus: true });
    if (valido) setPaso((p) => Math.min(p + 1, ULTIMO_PASO_ALTA));
  }

  // «Siguiente» y «Crear licitación» son el botón de envío del formulario, así que
  // Enter dentro de un campo hace lo mismo que el botón: avanzar de paso. Solo el
  // último paso crea la licitación (Enter en el expediente no la guarda a medias).
  function alEnviar(ev: React.FormEvent<HTMLFormElement>) {
    if (paso < ULTIMO_PASO_ALTA) {
      ev.preventDefault();
      void siguiente();
      return;
    }
    void handleSubmit(onSubmit, (errs) => setPaso(primerPasoConError(Object.keys(errs))))(ev);
  }

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

    toast.success("Licitación creada", {
      description: "Siguiente paso: sube la convocatoria y las bases en Documentos.",
    });
    router.push(hrefTrasCrear(json.data.id));
    router.refresh();
  }

  return (
    <form onSubmit={alEnviar} noValidate className="flex max-w-3xl flex-col gap-6">
      <nav aria-label="Pasos del alta">
        <ol className="flex items-start gap-2">
          {PASOS_ALTA.map((p, i) => {
            const hecho = i < paso;
            const actual = i === paso;
            const contenido = (
              <>
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums",
                    hecho && "border-primary bg-primary text-primary-foreground",
                    actual && "border-primary text-primary",
                    !hecho && !actual && "text-muted-foreground",
                  )}
                  aria-hidden="true"
                >
                  {hecho ? <Check className="size-3.5" /> : i + 1}
                </span>
                <span className="flex min-w-0 flex-col text-left">
                  <span className={cn("text-sm font-medium", !actual && !hecho && "text-muted-foreground")}>
                    {p.titulo}
                  </span>
                  {p.opcional && <span className="text-xs text-muted-foreground">Opcional</span>}
                </span>
              </>
            );
            return (
              <li key={p.id} className="flex-1" aria-current={actual ? "step" : undefined}>
                <div className={cn("mb-1.5 h-1 rounded-full", hecho || actual ? "bg-primary" : "bg-muted")} aria-hidden="true" />
                {hecho ? (
                  <button
                    type="button"
                    onClick={() => setPaso(i)}
                    className="flex w-full items-center gap-2 rounded-md py-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    {contenido}
                    <span className="sr-only">(volver a este paso)</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-2 py-1">{contenido}</div>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      <section
        ref={(el) => {
          seccionesRef.current[0] = el;
        }}
        hidden={paso !== 0}
        tabIndex={-1}
        aria-label={`Paso 1 de ${PASOS_ALTA.length}: ${PASOS_ALTA[0].titulo}`}
        className="outline-none"
      >
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
      </section>

      <section
        ref={(el) => {
          seccionesRef.current[1] = el;
        }}
        hidden={paso !== 1}
        tabIndex={-1}
        aria-label={`Paso 2 de ${PASOS_ALTA.length}: ${PASOS_ALTA[1].titulo}`}
        className="outline-none"
      >
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
          {errors.monto_maximo && <p className="text-sm text-destructive">{errors.monto_maximo.message}</p>}
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
      </section>

      <section
        ref={(el) => {
          seccionesRef.current[2] = el;
        }}
        hidden={paso !== 2}
        tabIndex={-1}
        aria-label={`Paso 3 de ${PASOS_ALTA.length}: ${PASOS_ALTA[2].titulo}`}
        className="outline-none"
      >
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="flex size-8 items-center justify-center rounded-lg bg-secondary text-primary">
              <CalendarClock className="size-4" />
            </span>
            Fechas del procedimiento
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Se creará <span className="font-medium text-foreground">{expedienteCapturado || "la licitación"}</span>
            {institucionCapturada ? ` de ${institucionCapturada}` : ""}. Las fechas se pueden dejar en blanco y
            completar después en «Fechas clave».
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FECHAS_ALTA.map((field) => (
              <div key={field.name} className="flex flex-col gap-2">
                <Label htmlFor={field.name}>{field.label}</Label>
                <Input id={field.name} className="h-11" type="datetime-local" {...register(field.name)} />
                {errors[field.name] && (
                  <p className="text-sm text-destructive">{errors[field.name]?.message}</p>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      </section>

      <div className="flex flex-col-reverse justify-between gap-2 sm:flex-row">
        <Button
          type="button"
          variant="outline"
          className="h-11"
          onClick={() => router.push("/licitaciones")}
        >
          Cancelar
        </Button>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          {paso > 0 && (
            <Button type="button" variant="outline" className="h-11" onClick={() => setPaso(paso - 1)}>
              <ArrowLeft className="size-4" />
              Atrás
            </Button>
          )}
          {paso < ULTIMO_PASO_ALTA ? (
            <Button key="siguiente" type="submit" className="h-11">
              Siguiente
              <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button key="crear" type="submit" className="h-11" disabled={loading}>
              {loading ? "Guardando…" : "Crear licitación"}
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
