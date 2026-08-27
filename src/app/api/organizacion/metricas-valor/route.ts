import { apiRoute, ApiError } from "@/lib/api";

// P2 · I7 — métricas de valor de la organización (P2.10 item 14).
export const GET = apiRoute({ rolesPermitidos: ["ADMIN", "MANAGER"] }, async ({ ctx }) => {
  const { data, error } = await ctx.supabase.rpc("metricas_valor");
  if (error) throw ApiError.internal();
  return { data };
});
