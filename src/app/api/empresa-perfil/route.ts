import { apiRoute, ApiError, requireWriteRole } from "@/lib/api";
import { empresaPerfilSchema } from "@/lib/validations/empresa-perfil";

export const GET = apiRoute({}, async ({ ctx }) => {
  const { data: perfil } = await ctx.supabase
    .from("users")
    .select("organization_id, empresa_perfil_id")
    .eq("id", ctx.userId)
    .maybeSingle();
  if (!perfil) throw ApiError.forbidden("Perfil no encontrado");

  const { data, error } = await ctx.supabase
    .from("empresa_perfil")
    .select("*")
    .eq("organization_id", perfil.organization_id)
    .order("updated_at", { ascending: true });

  if (error) throw ApiError.internal();

  return { data: { data, activaId: perfil.empresa_perfil_id } };
});

export const POST = apiRoute({ bodySchema: empresaPerfilSchema }, async ({ ctx, body }) => {
  requireWriteRole(ctx);

  const { data, error } = await ctx.supabase
    .from("empresa_perfil")
    .insert({ organization_id: ctx.organizationId, ...body })
    .select()
    .single();

  if (error) throw ApiError.internal();

  // Fallo aquí no debe bloquear la creación del perfil ya guardada — mismo
  // comportamiento "best effort" que el código original (no revisaba el
  // error de este update).
  await ctx.supabase.from("users").update({ empresa_perfil_id: data.id }).eq("id", ctx.userId);

  return { data };
});
