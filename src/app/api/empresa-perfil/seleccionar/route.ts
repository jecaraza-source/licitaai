import { z } from "zod";
import { apiRoute, ApiError } from "@/lib/api";

const bodySchema = z.object({ id: z.string().uuid("id debe ser un UUID válido") });

export const POST = apiRoute({ bodySchema }, async ({ ctx, body }) => {
  // El scope por organización lo aplica RLS, pero se re-verifica aquí para
  // devolver un 404 claro (no un update silencioso de 0 filas) si la
  // empresa no pertenece a la organización del llamante.
  const { data: empresa } = await ctx.supabase
    .from("empresa_perfil")
    .select("id")
    .eq("id", body.id)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();
  if (!empresa) throw ApiError.notFound("Empresa no encontrada");

  const { error } = await ctx.supabase
    .from("users")
    .update({ empresa_perfil_id: body.id })
    .eq("id", ctx.userId);

  if (error) throw ApiError.internal();
  return { data: { ok: true } };
});
