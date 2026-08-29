"use client";

import { FileCheck2, Plus, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  DOC_CONTRACTUAL_LABELS,
  useFormalizacionCard,
  useSeguimientoTab,
  type Seguimiento,
} from "@/hooks/use-seguimiento-tab";
import { useDropzone } from "react-dropzone";

function FormalizacionCard({
  licitacionId,
  organizationId,
  seguimiento,
  onUpdated,
}: {
  licitacionId: string;
  organizationId: string;
  seguimiento: Seguimiento | null;
  onUpdated: () => void;
}) {
  const { usuarios, campos, setCampos, subiendo, guardarCampo, subirDocumento } =
    useFormalizacionCard(licitacionId, organizationId, seguimiento, onUpdated);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">En caso de adjudicación — formalización</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {Object.entries(DOC_CONTRACTUAL_LABELS).map(([campo, label]) => (
            <DocumentoSlot
              key={campo}
              label={label}
              tieneDocumento={!!seguimiento?.[campo as keyof Seguimiento]}
              subiendo={subiendo === campo}
              onDrop={(file) => subirDocumento(campo, file)}
            />
          ))}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Vigencia — inicio</Label>
            <Input
              type="date"
              value={campos.vigencia_inicio ?? ""}
              onChange={(e) => setCampos((c) => ({ ...c, vigencia_inicio: e.target.value }))}
              onBlur={(e) => guardarCampo("vigencia_inicio", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Vigencia — fin</Label>
            <Input
              type="date"
              value={campos.vigencia_fin ?? ""}
              onChange={(e) => setCampos((c) => ({ ...c, vigencia_fin: e.target.value }))}
              onBlur={(e) => guardarCampo("vigencia_fin", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Orden de suministro</Label>
            <Input
              value={campos.orden_suministro ?? ""}
              onChange={(e) => setCampos((c) => ({ ...c, orden_suministro: e.target.value }))}
              onBlur={(e) => guardarCampo("orden_suministro", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Lugar de entrega</Label>
            <Input
              value={campos.lugar_entrega ?? ""}
              onChange={(e) => setCampos((c) => ({ ...c, lugar_entrega: e.target.value }))}
              onBlur={(e) => guardarCampo("lugar_entrega", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Administrador del contrato</Label>
            <Select
              value={seguimiento?.administrador_contrato_id ?? "__sin_asignar__"}
              onValueChange={(v) => v && guardarCampo("administrador_contrato_id", v === "__sin_asignar__" ? "" : v)}
            >
              <SelectTrigger className="w-full">
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
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Penalizaciones</Label>
            <Textarea
              value={campos.penalizaciones ?? ""}
              onChange={(e) => setCampos((c) => ({ ...c, penalizaciones: e.target.value }))}
              onBlur={(e) => guardarCampo("penalizaciones", e.target.value)}
              className="min-h-16 resize-none text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Niveles de servicio</Label>
            <Textarea
              value={campos.niveles_servicio ?? ""}
              onChange={(e) => setCampos((c) => ({ ...c, niveles_servicio: e.target.value }))}
              onBlur={(e) => guardarCampo("niveles_servicio", e.target.value)}
              className="min-h-16 resize-none text-sm"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DocumentoSlot({
  label,
  tieneDocumento,
  subiendo,
  onDrop,
}: {
  label: string;
  tieneDocumento: boolean;
  subiendo: boolean;
  onDrop: (file: File) => void;
}) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    maxFiles: 1,
    onDrop: ([file]) => file && onDrop(file),
  });

  return (
    <div
      {...getRootProps()}
      className={cn(
        "flex cursor-pointer flex-col items-center gap-1 rounded-md border border-dashed p-3 text-center text-xs",
        isDragActive ? "border-primary bg-primary/5" : "hover:bg-muted/40",
      )}
    >
      <input {...getInputProps()} />
      {tieneDocumento ? (
        <FileCheck2 className="size-4 text-emerald-600" />
      ) : (
        <UploadCloud className="size-4 text-muted-foreground" />
      )}
      <span className="font-medium">{label}</span>
      <span className="text-muted-foreground">
        {subiendo ? "Subiendo…" : tieneDocumento ? "Reemplazar" : "Subir"}
      </span>
    </div>
  );
}

function formatMonto(monto: number | null | undefined) {
  if (monto === null || monto === undefined) return "—";
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(monto);
}

export function SeguimientoTab({
  licitacionId,
  organizationId,
}: {
  licitacionId: string;
  organizationId: string;
}) {
  const {
    seguimiento,
    cargar,
    lecciones,
    setLecciones,
    tags,
    setTags,
    nuevoTag,
    setNuevoTag,
    analizando,
    guardando,
    getRootProps,
    getInputProps,
    isDragActive,
    handleGuardarLecciones,
  } = useSeguimientoTab(licitacionId, organizationId);

  if (seguimiento === undefined) {
    return <Skeleton className="h-64 w-full" />;
  }

  const resultado = seguimiento?.resultado_json;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Acta de fallo</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div
            {...getRootProps()}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors",
              isDragActive ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40",
            )}
          >
            <input {...getInputProps()} />
            <UploadCloud className="size-6 text-muted-foreground" />
            <p className="text-sm">
              {analizando ? "Analizando acta…" : "Arrastra el acta de fallo (PDF) para extraer el resultado"}
            </p>
          </div>

          {resultado && (resultado.empresa_ganadora || resultado.precio_ganador) && (
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">Empresa ganadora</dt>
                <dd className="font-medium">{resultado.empresa_ganadora ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Precio adjudicado</dt>
                <dd className="font-medium">{formatMonto(resultado.precio_ganador)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Nuestra posición</dt>
                <dd>{resultado.nuestra_posicion ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Diferencia de precio</dt>
                <dd>
                  {resultado.diferencia_precio_porcentaje !== null &&
                  resultado.diferencia_precio_porcentaje !== undefined
                    ? `${resultado.diferencia_precio_porcentaje.toFixed(1)}%`
                    : "—"}
                </dd>
              </div>
              {resultado.motivos_descalificacion && (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-muted-foreground">Motivos de descalificación</dt>
                  <dd className="text-destructive">{resultado.motivos_descalificacion}</dd>
                </div>
              )}
            </dl>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Lecciones aprendidas</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Textarea
            value={lecciones}
            onChange={(e) => setLecciones(e.target.value)}
            placeholder="¿Qué aprendimos de este proceso?"
            className="min-h-24"
          />
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => setTags(tags.filter((_, idx) => idx !== i))}
                  className="text-muted-foreground hover:text-destructive"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={nuevoTag}
              onChange={(e) => setNuevoTag(e.target.value)}
              placeholder="Agregar etiqueta"
              onKeyDown={(e) => {
                if (e.key === "Enter" && nuevoTag.trim()) {
                  e.preventDefault();
                  setTags([...tags, nuevoTag.trim()]);
                  setNuevoTag("");
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => {
                if (nuevoTag.trim()) {
                  setTags([...tags, nuevoTag.trim()]);
                  setNuevoTag("");
                }
              }}
            >
              <Plus />
            </Button>
          </div>
          <div className="flex justify-end">
            <Button onClick={handleGuardarLecciones} disabled={guardando}>
              {guardando ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <FormalizacionCard
        licitacionId={licitacionId}
        organizationId={organizationId}
        seguimiento={seguimiento}
        onUpdated={cargar}
      />
    </div>
  );
}
