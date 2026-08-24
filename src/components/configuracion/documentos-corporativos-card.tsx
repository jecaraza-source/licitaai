"use client";

import { useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import { FileText, Trash2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { cn, sanitizeFilename } from "@/lib/utils";
import type { DocumentoCorporativo } from "@/types";

const TIPOS_DOCUMENTO = [
  "Acta constitutiva",
  "Reformas",
  "Poder del representante legal",
  "Constancia de Situación Fiscal",
  "Identificación oficial",
  "Comprobante de domicilio",
  "Datos bancarios",
  "Opinión de cumplimiento fiscal (32-D)",
  "Cumplimiento IMSS",
  "Cumplimiento INFONAVIT",
  "Declaración de integridad",
  "Manifestación de no impedido",
  "Información de socios/accionistas",
  "Escrito de personalidad",
  "Declaración de nacionalidad",
  "Estratificación MIPYME",
  "Documentación RUPC",
  "Otro",
];

export function DocumentosCorporativosCard({ empresaId }: { empresaId: string }) {
  const [documentos, setDocumentos] = useState<DocumentoCorporativo[] | null>(null);
  const [noAplican, setNoAplican] = useState<string[]>([]);
  const [tipoSeleccionado, setTipoSeleccionado] = useState(TIPOS_DOCUMENTO[0]);
  const [subiendo, setSubiendo] = useState(false);

  function cargar() {
    fetch(`/api/empresa-perfil/${empresaId}/documentos`)
      .then((res) => res.json())
      .then((json) => setDocumentos(json.data ?? []));
    fetch(`/api/empresa-perfil/${empresaId}`)
      .then((res) => res.json())
      .then((json) => setNoAplican(json.data?.documentos_no_aplican ?? []));
  }

  async function toggleNoAplica(tipo: string, no_aplica: boolean) {
    setNoAplican((prev) => (no_aplica ? [...prev, tipo] : prev.filter((t) => t !== tipo)));
    const res = await fetch(`/api/empresa-perfil/${empresaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo, no_aplica }),
    });
    if (!res.ok) {
      toast.error("No se pudo actualizar");
      cargar();
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    maxFiles: 1,
    onDrop: async ([file]) => {
      if (!file) return;
      setSubiendo(true);
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data: perfil } = await supabase
        .from("users")
        .select("organization_id")
        .eq("id", user?.id ?? "")
        .single();

      const path = `${perfil?.organization_id}/${Date.now()}-${sanitizeFilename(file.name)}`;
      const { error: uploadError } = await supabase.storage
        .from("documentos-corporativos")
        .upload(path, file);

      if (uploadError) {
        setSubiendo(false);
        toast.error("No se pudo subir el documento", { description: uploadError.message });
        return;
      }

      const res = await fetch(`/api/empresa-perfil/${empresaId}/documentos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: tipoSeleccionado, nombre: file.name, storage_path: path }),
      });
      setSubiendo(false);

      if (!res.ok) {
        toast.error("No se pudo registrar el documento");
        return;
      }
      toast.success(`"${tipoSeleccionado}" guardado`);
      cargar();
    },
  });

  async function eliminar(doc: DocumentoCorporativo) {
    setDocumentos((prev) => (prev ? prev.filter((d) => d.id !== doc.id) : prev));
    await fetch(`/api/empresa-perfil/${empresaId}/documentos/${doc.id}`, { method: "DELETE" });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Documentos corporativos</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-xs text-muted-foreground">
          Bóveda permanente de la empresa: acta constitutiva, poderes, opiniones de cumplimiento,
          etc. (Paso 10). Se conservan aquí para reutilizarse en cualquier licitación.
        </p>

        {documentos !== null && (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium text-muted-foreground">Documentos requeridos</p>
            <ul className="flex flex-col gap-1">
              {TIPOS_DOCUMENTO.filter((tipo) => tipo !== "Otro").map((tipo) => {
                const subido = documentos.some((d) => d.tipo === tipo);
                const marcadoNoAplica = noAplican.includes(tipo);
                return (
                  <li key={tipo} className="flex items-center gap-2 text-sm">
                    <span
                      className={cn(
                        "size-2 shrink-0 rounded-full",
                        subido
                          ? "bg-emerald-500"
                          : marcadoNoAplica
                            ? "bg-muted-foreground/40"
                            : "bg-destructive",
                      )}
                    />
                    <span className={cn("flex-1", marcadoNoAplica && !subido && "text-muted-foreground line-through")}>
                      {tipo}
                    </span>
                    {!subido && (
                      <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                        <Checkbox
                          checked={marcadoNoAplica}
                          onCheckedChange={(checked) => toggleNoAplica(tipo, checked === true)}
                        />
                        No aplica
                      </label>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {documentos === null ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : documentos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay documentos.</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {documentos.map((doc) => (
              <li key={doc.id} className="flex items-center gap-2 py-2 text-sm">
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{doc.tipo}</p>
                  <p className="truncate text-xs text-muted-foreground">{doc.nombre}</p>
                </div>
                <Button variant="ghost" size="icon-sm" onClick={() => eliminar(doc)}>
                  <Trash2 className="text-destructive" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-2">
          <Label className="text-xs text-muted-foreground">Tipo de documento a subir</Label>
          <Select value={tipoSeleccionado} onValueChange={(v) => v && setTipoSeleccionado(v)}>
            <SelectTrigger className="w-full sm:w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIPOS_DOCUMENTO.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div
            {...getRootProps()}
            className={cn(
              "flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-2 text-xs",
              isDragActive ? "border-primary bg-primary/5" : "hover:bg-muted/40",
            )}
          >
            <input {...getInputProps()} />
            <UploadCloud className="size-3.5 text-muted-foreground" />
            {subiendo ? "Subiendo…" : `Arrastra el archivo de "${tipoSeleccionado}"`}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
