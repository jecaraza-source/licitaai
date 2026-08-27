import { apiRoute } from "@/lib/api";
import { estadoCircuitos } from "@/lib/circuit-breaker";

// P2 · E6 — estado de los proveedores de IA para la UI: cuando un circuito
// está OPEN, el frontend deshabilita el botón de la operación con un aviso
// en vez de encolar jobs que van a esperar.
export const GET = apiRoute({}, async ({ ctx }) => {
  const circuitos = await estadoCircuitos(ctx.supabase);
  const iaDisponible = circuitos.anthropic !== "OPEN" && circuitos.openai !== "OPEN";
  return { data: { circuitos, iaDisponible } };
});
