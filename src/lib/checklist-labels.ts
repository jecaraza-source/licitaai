import type { EstadoChecklistItem } from "@/types";

export const CATEGORIA_LABELS: Record<string, string> = {
  LEGAL: "Legal",
  FISCAL: "Fiscal",
  TECNICO: "Técnico",
  ECONOMICO: "Económico",
  ESPECIFICO: "Específico",
};

export const ESTADO_LABELS: Record<EstadoChecklistItem, string> = {
  VERDE: "Cumplido",
  AMARILLO: "En proceso",
  ROJO: "Riesgo",
  GRIS: "No aplica",
};

export const ESTADO_DOT: Record<EstadoChecklistItem, string> = {
  VERDE: "bg-emerald-500",
  AMARILLO: "bg-amber-500",
  ROJO: "bg-destructive",
  GRIS: "bg-muted-foreground/40",
};
