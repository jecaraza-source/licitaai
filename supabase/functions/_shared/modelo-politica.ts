// P2 · B4 (C4) — resolución de modelo por política de organización (Deno).
//
// Cada handler de IA llama a `resolverModelo()` con el modelo que usaría
// por defecto; devuelve el modelo REAL a usar tras aplicar
// `politica_modelo` + `modelos_permitidos` de la organización (vía la
// función SQL `resolver_modelo_ia`).
//
// Mientras el flag `ai.politica_modelo` esté OFF para la organización, se
// devuelve el modelo deseado sin cambios — cero impacto.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { isEnabled } from "./flags.ts";

export async function resolverModelo(
  supabase: SupabaseClient,
  organizationId: string,
  modeloDeseado: string,
  opts: { confianzaBaja?: boolean } = {},
): Promise<string> {
  try {
    const activo = await isEnabled(supabase, "ai.politica_modelo", { organizationId });
    if (!activo) return modeloDeseado;

    const { data, error } = await supabase.rpc("resolver_modelo_ia", {
      p_org: organizationId,
      p_modelo_deseado: modeloDeseado,
      p_confianza_baja: opts.confianzaBaja ?? false,
    });
    if (error || typeof data !== "string" || !data) return modeloDeseado;
    return data;
  } catch {
    return modeloDeseado;
  }
}
