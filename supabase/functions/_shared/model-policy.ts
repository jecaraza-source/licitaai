// P2 · B4 — Política de modelo por plan (docs/p2/16-pendientes.md fila B4).
//
// Traduce ai_org_policy.{modelos_permitidos, politica_modelo} en qué modelo
// de Anthropic usar para una llamada, y si corresponde escalar tras ver un
// nivel_confianza bajo en el resultado. "Económico" es claude-sonnet-5 (el
// modelo ya validado para este dominio) y "avanzado" es claude-opus-5 —
// deliberadamente NO se usa Haiku como económico por defecto en ningún
// plan (decisión de negocio explícita, no un descuido).
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export const MODELO_ECONOMICO = "claude-sonnet-5";
export const MODELO_AVANZADO = "claude-opus-5";

export interface PoliticaModelo {
  modelos_permitidos: string[];
  politica_modelo: "economico_por_defecto" | "avanzado_si_confianza_baja" | "siempre_avanzado";
}

// Igual al default de la columna en ai_org_policy — si la organización aún
// no tiene fila (no debería pasar tras B4, pero no debe tronar el análisis
// por eso), se comporta como si tuviera el plan más permisivo.
const POLITICA_DEFECTO: PoliticaModelo = {
  modelos_permitidos: [
    MODELO_ECONOMICO,
    "claude-haiku-4-5",
    MODELO_AVANZADO,
    "text-embedding-3-small",
    "text-embedding-3-small-mock",
  ],
  politica_modelo: "economico_por_defecto",
};

export async function obtenerPoliticaModelo(
  service: SupabaseClient,
  organizationId: string,
): Promise<PoliticaModelo> {
  try {
    const { data, error } = await service
      .from("ai_org_policy")
      .select("modelos_permitidos, politica_modelo")
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (error || !data) return POLITICA_DEFECTO;
    return data as PoliticaModelo;
  } catch {
    return POLITICA_DEFECTO;
  }
}

// Si el modelo deseado no está en el allowlist de la org, cae al mejor
// modelo permitido en vez de fallar la operación — una allowlist mal
// configurada nunca debe tronar el análisis de una licitación.
function conAllowlist(deseado: string, pol: PoliticaModelo): string {
  const permitidos = pol.modelos_permitidos ?? [];
  if (permitidos.includes(deseado)) return deseado;
  if (permitidos.includes(MODELO_ECONOMICO)) return MODELO_ECONOMICO;
  return permitidos[0] ?? MODELO_ECONOMICO;
}

/** Modelo con el que debe hacerse el intento inicial de una operación. */
export function modeloInicial(pol: PoliticaModelo): string {
  const deseado = pol.politica_modelo === "siempre_avanzado" ? MODELO_AVANZADO : MODELO_ECONOMICO;
  return conAllowlist(deseado, pol);
}

/** true si, tras ver nivel_confianza en el resultado del intento inicial,
 * corresponde reintentar esa sección/operación con el modelo avanzado. */
export function debeEscalar(pol: PoliticaModelo, nivelConfianza: string | null | undefined): boolean {
  return pol.politica_modelo === "avanzado_si_confianza_baja" && nivelConfianza === "BAJO";
}

/** Modelo a usar en el reintento por escalamiento. */
export function modeloEscalado(pol: PoliticaModelo): string {
  return conAllowlist(MODELO_AVANZADO, pol);
}
