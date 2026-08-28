// P2 · B4 (C4) — resolución de modelo por política de organización (Node).
// Gemelo de supabase/functions/_shared/modelo-politica.ts.
//
// Una ruta de IA llama a `resolverModelo()` con el modelo que usaría por
// defecto; devuelve el modelo REAL tras aplicar `politica_modelo` +
// `modelos_permitidos` de la organización (función SQL `resolver_modelo_ia`).
//
// Con el flag `ai.politica_modelo` OFF devuelve el modelo deseado sin
// cambios — cero impacto hasta activarlo.
import type { SupabaseClient } from "@supabase/supabase-js";
import { isEnabled } from "@/lib/flags";

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
