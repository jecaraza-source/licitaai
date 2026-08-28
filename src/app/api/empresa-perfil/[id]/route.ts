import { z } from "zod";
import { apiRoute, ApiError, requireWriteRole } from "@/lib/api";
import { empresaPerfilSchema } from "@/lib/validations/empresa-perfil";
import { TIPOS_DOCUMENTO_CORPORATIVO } from "@/lib/documentos-corporativos";

const paramsSchema = z.object({ id: z.string().uuid("id debe ser un UUID válido") });
const patchBodySchema = z.object({
  tipo: z.enum(TIPOS_DOCUMENTO_CORPORATIVO as [string, ...string[]]),
  no_aplica: z.boolean(),
});

export const GET = apiRoute({ paramsSchema }, async ({ ctx, params }) => {
  const { data, error } = await ctx.supabase.from("empresa_perfil").select().eq("id", params.id).maybeSingle();
  if (error) throw ApiError.internal();
  if (!data) throw ApiError.notFound("Perfil de empresa no encontrado");
  return { data };
});

export const PATCH = apiRoute({ paramsSchema, bodySchema: patchBodySchema }, async ({ ctx, params, body }) => {
  requireWriteRole(ctx);

  const { data: actual } = await ctx.supabase
    .from("empresa_perfil")
    .select("documentos_no_aplican")
    .eq("id", params.id)
    .maybeSingle();
  if (!actual) throw ApiError.notFound("Perfil de empresa no encontrado");

  const actuales = (actual.documentos_no_aplican as string[] | null) ?? [];
  const siguientes = body.no_aplica
    ? [...new Set([...actuales, body.tipo])]
    : actuales.filter((t) => t !== body.tipo);

  const { data, error } = await ctx.supabase
    .from("empresa_perfil")
    .update({ documentos_no_aplican: siguientes })
    .eq("id", params.id)
    .select("documentos_no_aplican")
    .single();

  if (error) throw ApiError.internal();
  return { data };
});

export const PUT = apiRoute({ paramsSchema, bodySchema: empresaPerfilSchema }, async ({ ctx, params, body }) => {
  requireWriteRole(ctx);

  const { data, error } = await ctx.supabase
    .from("empresa_perfil")
    .update(body)
    .eq("id", params.id)
    .select()
    .single();

  if (error) throw ApiError.notFound("Perfil de empresa no encontrado");
  return { data };
});
