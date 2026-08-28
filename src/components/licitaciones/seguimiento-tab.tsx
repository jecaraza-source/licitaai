"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useDropzone } from "react-dropzone";
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
import { cn, sanitizeFilename } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

interface Seguimiento {
  id: string;
  resultado_json: {
    empresa_ganadora?: string | null;
    precio_ganador?: number | null;
    nuestra_posicion?: string | null;
    motivos_descalificacion?: string | null;
    diferencia_precio_porcentaje?: number | null;
  };
  lecciones_aprendidas: string | null;
  tags_json: string[];
  contrato_documento_id: string | null;
  garantia_documento_id: string | null;
  fianza_documento_id: string | null;
  vigencia_inicio: string | null;
  vigencia_fin: string | null;
  administrador_contrato_id: string | null;
  orden_suministro: string | null;
  lugar_entrega: string | null;
  penalizaciones: string | null;
  niveles_servicio: string | null;
}

const DOC_CONTRACTUAL_LABELS: Record<string, string> = {
  contrato_documento_id: "Contrato",
  garantia_documento_id: "Garantía",
  fianza_documento_id: "Fianza",
};

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
  const [usuarios, setUsuarios] = useState<{ id: string; nombre: string }[]>([]);
  const [campos, setCampos] = useState({
    vigencia_inicio: seguimiento?.vigencia_inicio ?? "",
    vigencia_fin: seguimiento?.vigencia_fin ?? "",
    orden_suministro: seguimiento?.orden_suministro ?? "",
    lugar_entrega: seguimiento?.lugar_entrega ?? "",
    penalizaciones: seguimiento?.penalizaciones ?? "",
    niveles_servicio: seguimiento?.niveles_servicio ?? "",
  });
  const [subiendo, setSubiendo] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/organizacion/usuarios")
      .then((res) => res.json())
      .then((json) => setUsuarios(json.data ?? []));
  }, []);

  async function guardarCampo(campo: string, valor: string) {
    await fetch(`/api/licitaciones/${licitacionId}/seguimiento`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [campo]: valor || null }),
    });
  }

  const subirDocumento = useCallback(async (campo: string, file: File) => {
    setSubiendo(campo);
    const supabase = createClient();
    const sello = Date.now();
    const path = `${organizationId}/${licitacionId}/${sello}-${sanitizeFilename(file.name)}`;
    const { error: uploadError } = await supabase.storage
      .from("documentos-originales")
      .upload(path, file);

    if (uploadError) {
      setSubiendo(null);
      toast.error("No se pudo subir el archivo", { description: uploadError.message });
      return;
    }

    const { data: doc, error: insertError } = await supabase
      .from("documentos")
      .insert({
        licitacion_id: licitacionId,
        tipo_documento: campo.toUpperCase(),
        nombre: file.name,
        storage_path: path,
        tamanio_bytes: file.size,
      })
      .select()
      .single();

    if (insertError || !doc) {
      setSubiendo(null);
      await supabase.storage.from("documentos-originales").remove([path]);
      toast.error("No se pudo registrar el archivo");
      return;
    }

    const res = await fetch(`/api/licitaciones/${licitacionId}/seguimiento`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [campo]: doc.id }),
    });
    setSubiendo(null);
    if (!res.ok) {
      toast.error("No se pudo guardar la referencia del documento");
      return;
    }
    toast.success(`${DOC_CONTRACTUAL_LABELS[campo]} guardado`);
    onUpdated();
  }, [licitacionId, organizationId, onUpdated]);

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
  const [seguimiento, setSeguimiento] = useState<Seguimiento | null | undefined>(undefined);
  const [lecciones, setLecciones] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [nuevoTag, setNuevoTag] = useState("");
  const [analizando, setAnalizando] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(() => {
    fetch(`/api/licitaciones/${licitacionId}/seguimiento`)
      .then((res) => res.json())
      .then((json) => {
        setSeguimiento(json.data ?? null);
        setLecciones(json.data?.lecciones_aprendidas ?? "");
        setTags(json.data?.tags_json ?? []);
      });
  }, [licitacionId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { "application/pdf": [".pdf"] },
    maxFiles: 1,
    onDrop: async ([file]) => {
      if (!file) return;
      setAnalizando(true);
      const supabase = createClient();
      const path = `${organizationId}/${licitacionId}/${Date.now()}-${sanitizeFilename(file.name)}`;
      const { error: uploadError } = await supabase.storage
        .from("documentos-originales")
        .upload(path, file);
      if (uploadError) {
        setAnalizando(false);
        toast.error("No se pudo subir el acta");
        return;
      }
      const { data: doc, error: insertError } = await supabase
        .from("documentos")
        .insert({
          licitacion_id: licitacionId,
          tipo_documento: "ACTA_FALLO",
          nombre: file.name,
          storage_path: path,
          tamanio_bytes: file.size,
        })
        .select()
        .single();
      if (insertError || !doc) {
        setAnalizando(false);
        await supabase.storage.from("documentos-originales").remove([path]);
        toast.error("No se pudo registrar el acta");
        return;
      }

      const res = await fetch(`/api/licitaciones/${licitacionId}/seguimiento/analizar-fallo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documento_id: doc.id }),
      });
      setAnalizando(false);
      if (!res.ok) {
        toast.error("No se pudo analizar el acta de fallo");
        return;
      }
      toast.success("Acta de fallo analizada");
      cargar();
    },
  });

  async function handleGuardarLecciones() {
    setGuardando(true);
    const res = await fetch(`/api/licitaciones/${licitacionId}/seguimiento`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lecciones_aprendidas: lecciones, tags_json: tags }),
    });
    setGuardando(false);
    if (!res.ok) {
      toast.error("No se pudo guardar");
      return;
    }
    toast.success("Lecciones aprendidas guardadas");
  }

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
