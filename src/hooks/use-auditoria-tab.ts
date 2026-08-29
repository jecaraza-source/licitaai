"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { EstadoChecklistItem } from "@/types";

export interface DocumentoAuditoria {
  id: string;
  nombre: string;
  auditoria_json: {
    valido: boolean;
    observaciones: string[];
    nivel_riesgo: "VERDE" | "AMARILLO" | "ROJO";
  } | null;
}

export interface ChecklistItemAuditoria {
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
  documentos: DocumentoAuditoria | null;
  responsable: { id: string; nombre: string } | null;
}

export interface UsuarioOrg {
  id: string;
  nombre: string;
}

interface Inconsistencia {
  campo: string;
  detalle: string;
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
}

interface GateInfo {
  rojos: number;
  amarillosCriticos: number;
  bloqueado: boolean;
}

export interface AuditoriaData {
  score: number;
  porCategoria: Record<string, { total: number; completos: number; pct: number }>;
  checklist: ChecklistItemAuditoria[];
  ultimoReporte: Reporte | null;
  gate: GateInfo;
}

/** Actualiza un campo de un ítem del checklist — usado por ChecklistRow. */
export async function actualizarChecklistItem(itemId: string, campo: string, valor: unknown) {
  await fetch(`/api/checklist-items/${itemId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ [campo]: valor }),
  });
}

export function useAuditoriaTab(licitacionId: string) {
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
    toast.success("Auditoría del expediente actualizada");
    cargar();
  }

  return { data, usuarios, auditando, cargar, handleAuditarTodos };
}
