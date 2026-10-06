"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ShieldAlert, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { TrazabilidadRequisitosCard } from "@/components/licitaciones/trazabilidad-requisitos-card";
import { CATEGORIA_LABELS, ESTADO_DOT, ESTADO_LABELS } from "@/lib/checklist-labels";
import type { EstadoChecklistItem } from "@/types";

interface Documento {
  id: string;
  nombre: string;
  auditoria_json: {
    valido: boolean;
    observaciones: string[];
    nivel_riesgo: "VERDE" | "AMARILLO" | "ROJO";
  } | null;
}

interface ChecklistItem {
  id: string;
  categoria: string;
  descripcion: string;
  fundamento_legal: string | null;
  vigencia_requerida: string | null;
  requerido: boolean;
  estado: EstadoChecklistItem;
  critico: boolean;
  fuente: string | null;
  fecha_limite: string | null;
  observaciones: string | null;
  documento_id: string | null;
  aclaracion_id: string | null;
  tipo_formato: string | null;
  padre_id: string | null;
  cargado_compras_mx: boolean;
  coincide_compras_mx: boolean;
  subsanable: boolean | null;
  requiere_firma: boolean;
  requiere_membrete: boolean;
  requiere_folio: boolean;
  campo_compras_mx: string | null;
  pagina_fuente: string | null;
  pagina_evidencia: string | null;
  documentos: Documento | null;
  responsable: { id: string; nombre: string } | null;
}

interface UsuarioOrg {
  id: string;
  nombre: string;
}

interface Inconsistencia {
  campo: string;
  detalle: string;
  /** "determinista" = comparado por regla, no por la IA (Paso 15). */
  origen?: string;
}

interface PendienteCritico {
  descripcion: string;
  dias_estimados: number | null;
}

interface Reporte {
  resumen: string;
  pendientes_criticos: PendienteCritico[];
  advertencias: string[];
  inconsistencias?: Inconsistencia[];
  verificacion_automatica?: { documentos_comparados: number; documentos_total: number };
}

interface GateInfo {
  rojos: number;
  amarillosCriticos: number;
  bloqueado: boolean;
}

interface AuditoriaData {
  score: number;
  porCategoria: Record<string, { total: number; completos: number; pct: number }>;
  checklist: ChecklistItem[];
  ultimoReporte: Reporte | null;
  gate: GateInfo;
}

const SUBSANABLE_LABELS: Record<string, string> = {
  __sin_definir__: "Sin definir",
  si: "Sí, se puede subsanar",
  no: "No — causa de desechamiento",
};

const TIPO_FORMATO_LABELS: Record<string, string> = {
  A: "A — Obligatorio sin modificar",
  B: "B — Formato modelo",
  C: "C — Escrito libre con texto obligatorio",
  D: "D — Documento de tercero",
};

function scoreColor(score: number) {
  if (score >= 80) return "text-emerald-600";
  if (score >= 50) return "text-amber-600";
  return "text-destructive";
}

function ChecklistRow({
  item,
  onUpdated,
  usuarios,
  licitacionId,
  hijos = [],
}: {
  item: ChecklistItem;
  usuarios: UsuarioOrg[];
  onUpdated: () => void;
  licitacionId: string;
  /** Paso 5: sub-requisitos de un requisito compuesto (un solo nivel). */
  hijos?: ChecklistItem[];
}) {
  const [expandido, setExpandido] = useState(false);
  const [nuevoHijo, setNuevoHijo] = useState("");
  const [agregando, setAgregando] = useState(false);

  async function agregarHijo() {
    const descripcion = nuevoHijo.trim();
    if (!descripcion) return;
    setAgregando(true);
    const res = await fetch(`/api/licitaciones/${licitacionId}/checklist-items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ padre_id: item.id, descripcion }),
    });
    setAgregando(false);
    if (!res.ok) {
      toast.error("No se pudo agregar el sub-requisito");
      return;
    }
    setNuevoHijo("");
    onUpdated();
  }

  async function actualizar(campo: string, valor: unknown) {
    await fetch(`/api/checklist-items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [campo]: valor }),
    });
    onUpdated();
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          className="flex flex-1 items-start gap-2 text-left"
          onClick={() => setExpandido((v) => !v)}
        >
          <span className={cn("mt-1 size-2.5 shrink-0 rounded-full", ESTADO_DOT[item.estado])} />
          <span>
            <p className="text-sm font-medium">
              {item.descripcion}
              {item.critico && (
                <span className="ml-2 inline-flex items-center rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                  Crítico
                </span>
              )}
              {item.subsanable === false && (
                <span className="ml-2 inline-flex items-center rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                  No subsanable
                </span>
              )}
              {(item.requiere_firma || item.requiere_membrete || item.requiere_folio) && (
                <span className="ml-2 inline-flex items-center rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-secondary-foreground">
                  {[item.requiere_firma && "Firma", item.requiere_membrete && "Membrete", item.requiere_folio && "Folio"]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              )}
              {hijos.length > 0 && (
                <span className="ml-2 inline-flex items-center rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-secondary-foreground">
                  {hijos.filter((h) => h.estado === "VERDE" || h.estado === "GRIS").length}/{hijos.length} sub-requisitos
                </span>
              )}
              {item.aclaracion_id && (
                <span className="ml-2 inline-flex items-center rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                  Modificado por aclaración
                </span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {[item.fundamento_legal, item.fuente].filter(Boolean).join(" · ") || null}
            </p>
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-1.5">
          <Select value={item.estado} onValueChange={(v) => v && actualizar("estado", v)}>
            <SelectTrigger size="sm" className="w-32">
              <SelectValue>
                {(v: string | null) => (v ? ESTADO_LABELS[v as EstadoChecklistItem] : "")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(ESTADO_LABELS) as EstadoChecklistItem[]).map((e) => (
                <SelectItem key={e} value={e}>
                  {ESTADO_LABELS[e]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {expandido && (
        <div className="ml-4.5 flex flex-col gap-3">
          {item.documentos?.auditoria_json?.observaciones && (
            <ul className="list-disc pl-4 text-xs text-muted-foreground">
              {item.documentos.auditoria_json.observaciones.map((o, i) => (
                <li key={i}>{o}</li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox
                checked={item.critico}
                onCheckedChange={(checked) => actualizar("critico", checked === true)}
              />
              Marcar como requisito crítico
            </label>
            <div className="flex items-center gap-1.5">
              <Label className="text-xs text-muted-foreground">Tipo de formato</Label>
              <Select
                value={item.tipo_formato ?? "__sin_clasificar__"}
                onValueChange={(v) =>
                  actualizar("tipo_formato", v === "__sin_clasificar__" ? null : v)
                }
              >
                <SelectTrigger size="sm" className="h-7 w-40 text-xs">
                  <SelectValue>
                    {(v: string | null) => (!v || v === "__sin_clasificar__" ? "Sin clasificar" : TIPO_FORMATO_LABELS[v])}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__sin_clasificar__">Sin clasificar</SelectItem>
                  {Object.entries(TIPO_FORMATO_LABELS).map(([v, label]) => (
                    <SelectItem key={v} value={v}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">¿Dónde se pidió?</Label>
              <Input
                defaultValue={item.fuente ?? ""}
                onBlur={(e) => actualizar("fuente", e.target.value || null)}
                placeholder="Anexo Técnico, apartado 4.2"
                className="h-8 text-xs"
              />
              <Input
                aria-label="Página de la fuente"
                defaultValue={item.pagina_fuente ?? ""}
                onBlur={(e) => actualizar("pagina_fuente", e.target.value.trim() || null)}
                placeholder="Página (ej. 12)"
                className="h-8 text-xs"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">¿Quién lo atiende?</Label>
              <Select
                value={item.responsable?.id ?? "__sin_asignar__"}
                onValueChange={(v) =>
                  actualizar("responsable_id", v === "__sin_asignar__" ? null : v)
                }
              >
                <SelectTrigger size="sm" className="h-8 w-full text-xs">
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
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Fecha límite</Label>
              <Input
                type="date"
                defaultValue={item.fecha_limite ? item.fecha_limite.slice(0, 10) : ""}
                onBlur={(e) =>
                  actualizar(
                    "fecha_limite",
                    e.target.value ? new Date(e.target.value).toISOString() : null,
                  )
                }
                className="h-8 text-xs"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">¿Con qué se acredita? (evidencia/observaciones)</Label>
            <Textarea
              defaultValue={item.observaciones ?? ""}
              onBlur={(e) => actualizar("observaciones", e.target.value || null)}
              placeholder="Cómo se acredita este requisito"
              className="min-h-14 resize-none text-xs"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Documento: {item.documentos?.nombre ?? "Sin documento cargado"} · Súbelo o reemplázalo
            desde el tab Documentos. Los importes se concilian en Propuesta Económica.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Página de la evidencia</Label>
              <Input
                aria-label="Página de la evidencia"
                defaultValue={item.pagina_evidencia ?? ""}
                onBlur={(e) => actualizar("pagina_evidencia", e.target.value.trim() || null)}
                placeholder="Página dentro del archivo (ej. 3)"
                className="h-8 text-xs"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Campo de Compras MX asociado</Label>
              <Input
                aria-label="Campo de Compras MX asociado"
                defaultValue={item.campo_compras_mx ?? ""}
                onBlur={(e) => actualizar("campo_compras_mx", e.target.value.trim() || null)}
                placeholder="Pantalla o campo donde se captura"
                className="h-8 text-xs"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-1.5">
              <Label className="text-xs text-muted-foreground">¿Subsanable?</Label>
              <Select
                value={item.subsanable === null ? "__sin_definir__" : item.subsanable ? "si" : "no"}
                onValueChange={(v) => actualizar("subsanable", v === "__sin_definir__" ? null : v === "si")}
              >
                <SelectTrigger size="sm" className="h-7 w-56 text-xs" aria-label="¿Subsanable?">
                  <SelectValue>
                    {(v: string | null) => SUBSANABLE_LABELS[v ?? "__sin_definir__"] ?? "Sin definir"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(SUBSANABLE_LABELS).map(([v, label]) => (
                    <SelectItem key={v} value={v}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(
              [
                ["requiere_firma", "Requiere firma"],
                ["requiere_membrete", "Requiere membrete"],
                ["requiere_folio", "Requiere folio"],
              ] as const
            ).map(([campo, etiqueta]) => (
              <label key={campo} className="flex items-center gap-2 text-xs text-muted-foreground">
                <Checkbox checked={item[campo]} onCheckedChange={(c) => actualizar(campo, c === true)} />
                {etiqueta}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox
                checked={item.cargado_compras_mx}
                onCheckedChange={(c) => actualizar("cargado_compras_mx", c === true)}
              />
              ¿Se cargó en Compras MX?
            </label>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox
                checked={item.coincide_compras_mx}
                onCheckedChange={(c) => actualizar("coincide_compras_mx", c === true)}
              />
              ¿Coincide con lo capturado en Compras MX?
            </label>
          </div>

          {!item.padre_id && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`sub-${item.id}`} className="text-xs text-muted-foreground">
                Desglosar requisito compuesto (sub-requisito)
              </Label>
              <div className="flex gap-2">
                <Input
                  id={`sub-${item.id}`}
                  value={nuevoHijo}
                  onChange={(e) => setNuevoHijo(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void agregarHijo();
                    }
                  }}
                  placeholder="Ej. Currículum de cada especialista"
                  className="h-8 text-xs"
                />
                <Button type="button" size="sm" variant="outline" onClick={agregarHijo} disabled={agregando || !nuevoHijo.trim()}>
                  Agregar
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
      {hijos.length > 0 && (
        <div className="ml-4.5 flex flex-col gap-2 border-l pl-3">
          {hijos.map((h) => (
            <ChecklistRow key={h.id} item={h} usuarios={usuarios} onUpdated={onUpdated} licitacionId={licitacionId} />
          ))}
        </div>
      )}
    </div>
  );
}

export function AuditoriaTab({ licitacionId }: { licitacionId: string }) {
  const [data, setData] = useState<AuditoriaData | null>(null);
  const [usuarios, setUsuarios] = useState<UsuarioOrg[]>([]);
  const [auditando, setAuditando] = useState(false);

  const cargar = useCallback(() => {
    fetch(`/api/licitaciones/${licitacionId}/auditoria`)
      .then((res) => res.json())
      .then((json) => setData(json.data));
  }, [licitacionId]);

  useEffect(() => {
    cargar();
    fetch("/api/organizacion/usuarios")
      .then((res) => res.json())
      .then((json) => setUsuarios(json.data ?? []));
  }, [cargar]);

  async function handleAuditarTodos() {
    setAuditando(true);
    const res = await fetch(`/api/licitaciones/${licitacionId}/auditoria/auditar-todos`, {
      method: "POST",
    });
    setAuditando(false);
    if (!res.ok) {
      toast.error("No se pudo completar la auditoría");
      return;
    }
    const json = await res.json().catch(() => null);
    const fallidos: number = json?.data?.documentos?.fallidos ?? 0;
    if (fallidos > 0) {
      toast.warning(
        `Auditoría parcial: ${fallidos} documento(s) no se pudieron auditar. Vuelve a intentarlo para completarlos.`,
      );
    } else {
      toast.success("Auditoría del expediente actualizada");
    }
    cargar();
  }

  if (!data) {
    return <Skeleton className="h-96 w-full" />;
  }

  const grupos = Object.entries(
    data.checklist.reduce<Record<string, ChecklistItem[]>>((acc, item) => {
      if (!item.padre_id) (acc[item.categoria] ??= []).push(item);
      return acc;
    }, {}),
  );

  return (
    <div className="flex flex-col gap-6" id="auditoria-printable">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Button onClick={handleAuditarTodos} disabled={auditando}>
          <Sparkles />
          {auditando ? "Auditando…" : "Auditar todos los documentos con IA"}
        </Button>
        <Button variant="outline" onClick={() => window.print()}>
          Exportar reporte PDF
        </Button>
      </div>

      {data.gate.bloqueado && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
          <p>
            {data.gate.rojos} requisito(s) en rojo y {data.gate.amarillosCriticos} crítico(s) en
            amarillo impiden marcar este procedimiento como enviado. Revisa la pestaña{" "}
            <strong>Liberación</strong> para el detalle.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="flex flex-col items-center justify-center py-8">
          <p className={cn("text-6xl font-bold", scoreColor(data.score))}>{data.score}</p>
          <p className="mt-1 text-sm text-muted-foreground">Score de expediente</p>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">Por categoría</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {Object.entries(data.porCategoria).map(([cat, info]) => (
              <div key={cat}>
                <div className="mb-1 flex justify-between text-xs">
                  <span>{CATEGORIA_LABELS[cat] ?? cat}</span>
                  <span className="text-muted-foreground">
                    {info.completos}/{info.total}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      info.pct >= 80 ? "bg-emerald-500" : info.pct >= 50 ? "bg-amber-500" : "bg-destructive",
                    )}
                    style={{ width: `${info.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {data.ultimoReporte && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Consistencia documental y pendientes críticos</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">{data.ultimoReporte.resumen}</p>
            {data.ultimoReporte.inconsistencias && data.ultimoReporte.inconsistencias.length > 0 && (
              <div>
                <p className="text-xs font-medium text-destructive">
                  Inconsistencias entre documentos
                </p>
                <ul className="flex flex-col gap-1">
                  {data.ultimoReporte.inconsistencias.map((inc, i) => (
                    <li key={i} className="text-sm">
                      <span className="font-medium">{inc.campo}:</span>{" "}
                      <span className="text-muted-foreground">{inc.detalle}</span>
                      {inc.origen === "determinista" && (
                        <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 align-middle text-[10px] font-medium text-muted-foreground">
                          verificado por regla
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {data.ultimoReporte.verificacion_automatica && (
              <p className="text-xs text-muted-foreground">
                Verificación automática de RFC, razón social y número de procedimiento:{" "}
                {data.ultimoReporte.verificacion_automatica.documentos_comparados} de{" "}
                {data.ultimoReporte.verificacion_automatica.documentos_total} documento(s)
                comparados.
                {data.ultimoReporte.verificacion_automatica.documentos_comparados <
                  data.ultimoReporte.verificacion_automatica.documentos_total &&
                  " Los documentos auditados antes de esta función no entran: vuelve a auditarlos para incluirlos."}
              </p>
            )}
            {data.ultimoReporte.pendientes_criticos.length > 0 && (
              <ul className="flex flex-col gap-1">
                {data.ultimoReporte.pendientes_criticos.map((p, i) => (
                  <li key={i} className="flex justify-between text-sm">
                    <span className="text-destructive">{p.descripcion}</span>
                    {p.dias_estimados !== null && (
                      <span className="text-xs text-muted-foreground">~{p.dias_estimados} días</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {data.ultimoReporte.advertencias.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground">Advertencias</p>
                <ul className="list-disc pl-4 text-sm text-muted-foreground">
                  {data.ultimoReporte.advertencias.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-4">
        {grupos.map(([categoria, items]) => (
          <Card key={categoria}>
            <CardHeader>
              <CardTitle className="text-sm">{CATEGORIA_LABELS[categoria] ?? categoria}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {items.map((item) => (
                <ChecklistRow
                  key={item.id}
                  item={item}
                  usuarios={usuarios}
                  onUpdated={cargar}
                  licitacionId={licitacionId}
                  hijos={data.checklist.filter((h) => h.padre_id === item.id)}
                />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      <TrazabilidadRequisitosCard items={data.checklist} />
    </div>
  );
}
