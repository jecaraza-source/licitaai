import { z } from "zod";
import { apiRoute, ApiError, requireWriteRole } from "@/lib/api";

const paramsSchema = z.object({ id: z.string().uuid("id debe ser un UUID válido") });
const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("asignar"), revisor_id: z.string().uuid("revisor_id debe ser un UUID válido") }),
  z.object({ action: z.literal("confirmar") }),
]);

export const POST = apiRoute({ paramsSchema, bodySchema }, async ({ ctx, params, body }) => {
  requireWriteRole(ctx);

  const { data: actual } = await ctx.supabase
    .from("propuestas")
    .select("id, created_by, revisor_id")
    .eq("licitacion_id", params.id)
    .eq("tipo", "TECNICA")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!actual) throw ApiError.notFound("No hay propuesta técnica generada");

  if (body.action === "asignar") {
    if (body.revisor_id === actual.created_by) {
      throw ApiError.validation(
        "El revisor debe ser distinto de quien elaboró la propuesta (doble check, Paso 17)",
      );
    }
    const { data, error } = await ctx.supabase
      .from("propuestas")
      .update({ revisor_id: body.revisor_id, revisado_at: null })
      .eq("id", actual.id)
      .select()
      .single();
    if (error) throw ApiError.internal();
    return { data };
  }

  // action === "confirmar"
  if (!actual.revisor_id) {
    throw ApiError.validation("Asigna primero un revisor");
  }
  if (actual.revisor_id !== ctx.userId) {
    throw ApiError.forbidden("Solo el revisor asignado puede confirmar la revisión");
  }
  const { data, error } = await ctx.supabase
    .from("propuestas")
    .update({ revisado_at: new Date().toISOString() })
    .eq("id", actual.id)
    .select()
    .single();
  if (error) throw ApiError.internal();
  return { data };
});
