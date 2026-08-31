"use client";

import { useCallback, useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import { BadgeCheck, FileText, Sparkles, TriangleAlert, Trash2, UploadCloud } from "lucide-react";
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
import { createClient } from "@/lib/supabase/client";
import { cn, sanitizeFilename } from "@/lib/utils";
import { TIPOS_DOCUMENTO_CORPORATIVO } from "@/lib/documentos-corporativos";
import type { DocumentoCorporativo } from "@/types";

const TIPOS_DOCUMENTO = TIPOS_DOCUMENTO_CORPORATIVO;

/**
 * Recordatorio de vigencia por tipo de documento, para que no se suban
 * documentos vencidos. Fuentes: reglas de vigencia de la opinión de
 * cumplimiento SAT (30 días naturales, art. 32-D CFF), IMSS (15 días
 * hábiles) e INFONAVIT (30 días naturales); práctica común en
 * convocatorias para comprobante de domicilio y estado de cuenta.
 */
const VIGENCIAS: Record<string, string> = {
  "Acta constitutiva": "sin vigencia, es permanente",
  Reformas: "sin vigencia, es permanente",
  "Poder del representante legal": "vigente mientras no se revoque",
  "Constancia de Situación Fiscal": "recomendado no mayor a 30 días de emisión",
  "Identificación oficial": "según el documento; INE: 10 años",
  "Comprobante de domicilio": "no mayor a 3 meses de antigüedad",
  "Datos bancarios": "no mayor a 3 meses de antigüedad",
  "Opinión de cumplimiento fiscal (32-D)": "30 días naturales",
  "Cumplimiento IMSS": "15 días hábiles",
  "Cumplimiento INFONAVIT": "30 días naturales",
  REPSE: "registro vigente ante la STPS; renovación cada 3 años",
};

// Debe reflejar los mismos tipos que REGLAS_VIGENCIA en el edge function
// analizar-documento-corporativo: son los únicos donde una fecha de
// emisión permite calcular una fecha de vigencia.
const TIPOS_CON_VIGENCIA_CALCULABLE = new Set([
  "Constancia de Situación Fiscal",
  "Comprobante de domicilio",
  "Datos bancarios",
  "Opinión de cumplimiento fiscal (32-D)",
  "Cumplimiento IMSS",
  "Cumplimiento INFONAVIT",
]);

// Debe reflejar los mismos tipos que CAMPOS_EXTRA_POR_TIPO en el edge
// function analizar-documento-corporativo: son los únicos donde la IA
// extrae datos legales estructurados (además de fecha/vigencia) que luego
// se pueden usar para prellenar Configuración > Datos legales.
const TIPOS_CON_DATOS_LEGALES_EXTRAIBLES = new Set([
  "Acta constitutiva",
  "Reformas",
  "Poder del representante legal",
  "Comprobante de domicilio",
]);

type EstadoVigencia = "vigente" | "por_vencer" | "vencido";

function estadoVigencia(vigenciaHasta: string): EstadoVigencia {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const limite = new Date(`${vigenciaHasta}T00:00:00`);
  const diasRestantes = Math.ceil((limite.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));

  if (diasRestantes < 0) return "vencido";
  if (diasRestantes <= 7) return "por_vencer";
  return "vigente";
}

function VigenciaBadge({ doc }: { doc: DocumentoCorporativo }) {
  if (!doc.vigencia_hasta) return null;

  const estado = estadoVigencia(doc.vigencia_hasta);
  const fecha = new Date(`${doc.vigencia_hasta}T00:00:00`).toLocaleDateString("es-MX");
  const estilos: Record<EstadoVigencia, string> = {
    vigente: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    por_vencer: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    vencido: "bg-destructive/10 text-destructive",
  };
  const etiquetas: Record<EstadoVigencia, string> = {
    vigente: `Vigente hasta ${fecha}`,
    por_vencer: `Vence pronto (${fecha})`,
    vencido: `Vencido desde ${fecha}`,
  };

  return (
    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", estilos[estado])}>
      {etiquetas[estado]}
    </span>
  );
}

function EmpresaMismatchBadge({ doc }: { doc: DocumentoCorporativo }) {
  if (doc.coincide_empresa !== false) return null;

  return (
    <span className="flex shrink-0 items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
      <TriangleAlert className="size-3" />
      No coincide con la empresa activa
    </span>
  );
}

/** Bajo el nombre del documento: el motivo concreto cuando NO coincide, o
 * una confirmación cuando sí coincide y hubo datos para verificar. */
function CoincidenciaEmpresaDetalle({ doc }: { doc: DocumentoCorporativo }) {
  if (doc.coincide_empresa === false) {
    const detalle =
      doc.motivo_no_coincide ??
      (doc.rfc_detectado
        ? `El RFC detectado en el documento (${doc.rfc_detectado}) no coincide con el de tu empresa activa.`
        : doc.razon_social_detectada
          ? `La razón social detectada ("${doc.razon_social_detectada}") no coincide con la de tu empresa activa.`
          : "Los datos del documento no coinciden con los de tu empresa activa.");
    return (
      <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
        <TriangleAlert className="size-3.5 shrink-0 translate-y-0.5" />
        <span>{detalle}</span>
      </div>
    );
  }

  if (doc.coincide_empresa === true && (doc.rfc_detectado || doc.razon_social_detectada)) {
    const que = doc.rfc_detectado
      ? `el RFC del documento (${doc.rfc_detectado})`
      : `la razón social del documento ("${doc.razon_social_detectada}")`;
    return (
      <div className="flex items-start gap-2 rounded-md bg-emerald-500/10 px-3 py-2 text-xs text-emerald-600 dark:text-emerald-400">
        <BadgeCheck className="size-3.5 shrink-0 translate-y-0.5" />
        <span>Verificado: {que} coincide con tu empresa activa.</span>
      </div>
    );
  }

  return null;
}

const TIPOS_REPRESENTANTE = ["Poder del representante legal"];

function normalizarNombre(nombre: string): string {
  return nombre
    .toUpperCase()
    .normalize("NFD")
    .replace(/[^A-Z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Coinciden si todos los nombres/apellidos del más corto aparecen en el más largo. */
function nombresCoinciden(a: string, b: string): boolean {
  const tokensA = normalizarNombre(a).split(" ").filter(Boolean);
  const tokensB = normalizarNombre(b).split(" ").filter(Boolean);
  if (tokensA.length < 2 || tokensB.length < 2) return false;

  const [menor, mayor] = tokensA.length <= tokensB.length ? [tokensA, tokensB] : [tokensB, tokensA];
  const mayorSet = new Set(mayor);
  return menor.every((token) => mayorSet.has(token));
}

function verificarRepresentante(
  documentos: DocumentoCorporativo[],
): { coincide: boolean; nombrePoder: string; nombreId: string } | null {
  const idDoc = documentos.find((d) => d.tipo === "Identificación oficial" && d.nombre_persona_detectado);
  const poderDoc = documentos.find(
    (d) => TIPOS_REPRESENTANTE.includes(d.tipo) && d.nombre_persona_detectado,
  );
  if (!idDoc?.nombre_persona_detectado || !poderDoc?.nombre_persona_detectado) return null;

  return {
    coincide: nombresCoinciden(idDoc.nombre_persona_detectado, poderDoc.nombre_persona_detectado),
    nombrePoder: poderDoc.nombre_persona_detectado,
    nombreId: idDoc.nombre_persona_detectado,
  };
}

function RepresentanteVerificacion({ documentos }: { documentos: DocumentoCorporativo[] }) {
  const verificacion = verificarRepresentante(documentos);
  if (!verificacion) return null;

  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md px-3 py-2 text-xs",
        verificacion.coincide
          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          : "bg-destructive/10 text-destructive",
      )}
    >
      {verificacion.coincide ? (
        <BadgeCheck className="size-3.5 shrink-0 translate-y-0.5" />
      ) : (
        <TriangleAlert className="size-3.5 shrink-0 translate-y-0.5" />
      )}
      {verificacion.coincide ? (
        <span>
          El representante legal coincide con su identificación oficial ({verificacion.nombreId}).
        </span>
      ) : (
        <span>
          El nombre del poder/escrito de personalidad (&quot;{verificacion.nombrePoder}&quot;) no coincide
          con la identificación oficial (&quot;{verificacion.nombreId}&quot;). Verifícalo.
        </span>
      )}
    </div>
  );
}

export function DocumentosCorporativosCard({ empresaId }: { empresaId: string }) {
  const [documentos, setDocumentos] = useState<DocumentoCorporativo[] | null>(null);
  const [noAplican, setNoAplican] = useState<string[]>([]);
  const [tipoSeleccionado, setTipoSeleccionado] = useState(TIPOS_DOCUMENTO[0]);
  const [subiendo, setSubiendo] = useState(false);
  const [analizandoIds, setAnalizandoIds] = useState<string[]>([]);
  const [fechasManuales, setFechasManuales] = useState<Record<string, string>>({});

  // P1.5 — `cargar` estable (useCallback) para poder listarla como
  // dependencia de los efectos/callbacks que la usan, en vez de silenciar
  // exhaustive-deps.
  const cargar = useCallback(() => {
    fetch(`/api/empresa-perfil/${empresaId}/documentos`)
      .then((res) => res.json())
      .then((json) => setDocumentos(json.data ?? []));
    fetch(`/api/empresa-perfil/${empresaId}`)
      .then((res) => res.json())
      .then((json) => setNoAplican(json.data?.documentos_no_aplican ?? []));
  }, [empresaId]);

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
  }, [cargar]);

  const analizarVigencia = useCallback(
    async (docId: string, fechaEmisionManual?: string) => {
      setAnalizandoIds((prev) => [...prev, docId]);
      try {
        const res = await fetch(`/api/empresa-perfil/${empresaId}/documentos/${docId}/analizar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fecha_emision_manual: fechaEmisionManual ?? null }),
        });
        if (!res.ok) {
          toast.error("No se pudo calcular la vigencia", {
            description: fechaEmisionManual
              ? undefined
              : "No se detectó la fecha de emisión automáticamente. Captúrala manualmente.",
          });
          return;
        }
        const json = await res.json().catch(() => null);
        if (!fechaEmisionManual && json?.data?.coincide_empresa === false) {
          toast.warning("El documento no coincide con la empresa activa", {
            description:
              json?.data?.motivo_no_coincide ??
              "El RFC o razón social detectados no corresponden a esta empresa. Verifícalo.",
          });
        }
        if (!fechaEmisionManual) {
          const camposExtraidos = Object.keys(json?.data?.datos_extraidos_json ?? {});
          if (camposExtraidos.length > 0) {
            toast.success(`Se extrajeron ${camposExtraidos.length} dato(s) legales del documento`, {
              description: 'Revísalos y aplícalos en "Datos legales" con el botón de prellenado.',
            });
          }
        }
        cargar();
      } catch {
        toast.error("No se pudo calcular la vigencia", { description: "Error de red inesperado" });
      } finally {
        setAnalizandoIds((prev) => prev.filter((id) => id !== docId));
      }
    },
    [empresaId, cargar],
  );

  const subirDocumento = useCallback(
    async (file: File) => {
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
      const json = await res.json().catch(() => null);
      setSubiendo(false);

      if (!res.ok || !json?.data?.id) {
        await supabase.storage.from("documentos-corporativos").remove([path]);
        toast.error("No se pudo registrar el documento");
        return;
      }
      toast.success(`"${tipoSeleccionado}" guardado`);
      cargar();
      analizarVigencia(json.data.id);
    },
    [empresaId, tipoSeleccionado, analizarVigencia, cargar],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { "application/pdf": [".pdf"], "image/jpeg": [".jpg", ".jpeg"], "image/png": [".png"] },
    maxFiles: 1,
    onDrop: ([file]) => {
      if (file) subirDocumento(file);
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
                      {VIGENCIAS[tipo] && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({VIGENCIAS[tipo]})
                        </span>
                      )}
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

        {documentos && documentos.length > 0 && <RepresentanteVerificacion documentos={documentos} />}

        {documentos === null ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : documentos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay documentos.</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {documentos.map((doc) => {
              const analizando = analizandoIds.includes(doc.id);
              const puedeCalcularVigencia = TIPOS_CON_VIGENCIA_CALCULABLE.has(doc.tipo);
              const puedeExtraerDatosLegales = TIPOS_CON_DATOS_LEGALES_EXTRAIBLES.has(doc.tipo);
              const yaExtrajoDatos = Object.keys(doc.datos_extraidos_json ?? {}).length > 0;
              return (
                <li key={doc.id} className="flex flex-col gap-1.5 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{doc.tipo}</p>
                      <p className="truncate text-xs text-muted-foreground">{doc.nombre}</p>
                    </div>
                    {analizando ? (
                      <span className="shrink-0 text-xs text-muted-foreground">Calculando vigencia…</span>
                    ) : (
                      <>
                        <EmpresaMismatchBadge doc={doc} />
                        <VigenciaBadge doc={doc} />
                      </>
                    )}
                    <Button variant="ghost" size="icon-sm" onClick={() => eliminar(doc)}>
                      <Trash2 className="text-destructive" />
                    </Button>
                  </div>
                  {!analizando && (
                    <div className="pl-6">
                      <CoincidenciaEmpresaDetalle doc={doc} />
                    </div>
                  )}
                  {puedeCalcularVigencia && (
                    <div className="flex items-center gap-2 pl-6">
                      <Label className="shrink-0 text-xs text-muted-foreground">
                        Fecha de emisión
                      </Label>
                      <Input
                        type="date"
                        className="h-7 w-36 text-xs"
                        value={fechasManuales[doc.id] ?? doc.fecha_emision ?? ""}
                        onChange={(e) =>
                          setFechasManuales((prev) => ({ ...prev, [doc.id]: e.target.value }))
                        }
                      />
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        disabled={analizando || !(fechasManuales[doc.id] ?? doc.fecha_emision)}
                        onClick={() =>
                          analizarVigencia(doc.id, fechasManuales[doc.id] ?? doc.fecha_emision ?? "")
                        }
                      >
                        Guardar
                      </Button>
                    </div>
                  )}
                  {puedeExtraerDatosLegales && (
                    <div className="flex items-center gap-2 pl-6">
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        disabled={analizando}
                        onClick={() => analizarVigencia(doc.id)}
                      >
                        <Sparkles className="size-3.5" />
                        {yaExtrajoDatos ? "Volver a extraer datos con IA" : "Extraer datos con IA"}
                      </Button>
                      {yaExtrajoDatos && (
                        <span className="text-xs text-muted-foreground">
                          {Object.keys(doc.datos_extraidos_json).length} dato(s) listos para prellenar
                        </span>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
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
