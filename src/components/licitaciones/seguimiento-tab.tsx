"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useDropzone } from "react-dropzone";
import { Plus, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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

  function cargar() {
    fetch(`/api/licitaciones/${licitacionId}/seguimiento`)
      .then((res) => res.json())
      .then((json) => {
        setSeguimiento(json.data ?? null);
        setLecciones(json.data?.lecciones_aprendidas ?? "");
        setTags(json.data?.tags_json ?? []);
      });
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [licitacionId]);

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
    </div>
  );
}
