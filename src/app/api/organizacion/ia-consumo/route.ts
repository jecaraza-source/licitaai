import { apiRoute, ApiError } from "@/lib/api";
import { rolPlataforma } from "@/lib/platform-admin";
import type { EstadoConsumoIA } from "@/lib/ia-topes";

// Consola de IA — consumo y topes de la organización del llamante. Lo ven
// ADMIN y MANAGER; solo un admin de plataforma puede editar los topes
// (PATCH /api/admin/ia-topes), y la respuesta lo indica en `puede_editar`.
export const GET = apiRoute({ rolesPermitidos: ["ADMIN", "MANAGER"] }, async ({ ctx }) => {
  const { data, error } = await ctx.supabase.rpc("ai_estado_consumo");
  if (error || !data) throw ApiError.internal();

  const estado = data as unknown as EstadoConsumoIA;
  const puedeEditar = (await rolPlataforma(ctx.supabase, ctx.userId)) === "ADMIN";
  return { data: { ...estado, puede_editar: puedeEditar } };
});
