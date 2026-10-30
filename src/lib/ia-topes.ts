import { z } from "zod";

// Consola de IA (Configuración): topes de gasto en USD por organización.
// El bloqueo lo aplica check_ai_budget en Postgres (migración
// 20261030190000_ai_topes_usd.sql); aquí viven la validación y la
// presentación del estado, compartidas por la API y la pantalla.

export const TOPE_MENSUAL_MAX_USD = 10_000;
export const TOPE_DIARIO_MAX_USD = 1_000;

export const topesSchema = z
  .object({
    organization_id: z.string().uuid("Organización inválida"),
    cuota_mensual_usd: z
      .number("La cuota mensual debe ser un número")
      .min(0, "La cuota mensual no puede ser negativa")
      .max(TOPE_MENSUAL_MAX_USD, `La cuota mensual máxima es ${TOPE_MENSUAL_MAX_USD} USD`),
    limite_diario_usd: z
      .number("El límite diario debe ser un número")
      .min(0, "El límite diario no puede ser negativo")
      .max(TOPE_DIARIO_MAX_USD, `El límite diario máximo es ${TOPE_DIARIO_MAX_USD} USD`),
    topes_usd_activos: z.boolean(),
  })
  .refine((t) => t.limite_diario_usd <= t.cuota_mensual_usd, {
    message: "El límite diario no puede ser mayor que la cuota mensual",
    path: ["limite_diario_usd"],
  });

export type Topes = z.infer<typeof topesSchema>;

export interface EstadoConsumoIA {
  organization_id: string;
  gasto_hoy_usd: number;
  gasto_mes_usd: number;
  limite_diario_usd: number;
  cuota_mensual_usd: number;
  alertas_umbral_pct: number[];
  topes_usd_activos: boolean;
  /** Lo agrega la API: solo un admin de plataforma puede cambiar los topes. */
  puede_editar?: boolean;
}

export type NivelUso = "normal" | "atencion" | "critico" | "agotado";

/** Porcentaje consumido (puede pasar de 100). Con tope 0 y gasto > 0 es 100;
 * con tope 0 y sin gasto es 0. */
export function porcentajeUso(gasto: number, tope: number): number {
  if (!(gasto > 0)) return 0;
  if (!(tope > 0)) return 100;
  return Math.round((gasto / tope) * 1000) / 10;
}

/** Nivel según los umbrales de alerta de la política (por defecto 50/80/95):
 * el segundo umbral marca "atención" y el último "crítico"; 100 % es agotado. */
export function nivelUso(pct: number, umbrales: readonly number[] = [50, 80, 95]): NivelUso {
  if (pct >= 100) return "agotado";
  const orden = [...umbrales].sort((a, b) => a - b);
  const critico = orden[orden.length - 1] ?? 95;
  const atencion = orden.length >= 2 ? (orden[orden.length - 2] ?? 80) : 80;
  if (pct >= critico) return "critico";
  if (pct >= atencion) return "atencion";
  return "normal";
}

export function formatoUsd(n: number): string {
  return `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
}
