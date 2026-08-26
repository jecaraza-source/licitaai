import { z } from "zod";
import { apiRoute, ApiError, requireWriteRole } from "@/lib/api";
import { TIPOS_DOCUMENTO_CORPORATIVO } from "@/lib/documentos-corporativos";

const paramsSchema = z.object({ id: z.string().uuid("id debe ser un UUID válido") });
const postBodySchema = z.object({
  tipo: z.enum(TIPOS_DOCUMENTO_CORPORATIVO as [string, ...string[]]),
  nombre: z.string().trim().min(1).max(500),
  storage_path: z.string().trim().min(1).max(1000),
  vigencia_hasta: z.string().trim().nullable().optional(),
});

export const GET = apiRoute({ paramsSchema }, async ({ ctx, params }) => {
  const { data, error } = await ctx.supabase
    .from("documentos_corporativos")
    .select("*")
    .eq("empresa_perfil_id", params.id)
    .order("created_at", { ascending: false });

  if (error) throw ApiError.internal();
  return { data };
});

export const POST = apiRoute({ paramsSchema, bodySchema: postBodySchema }, async ({ ctx, params, body }) => {
  requireWriteRole(ctx);

  const { data, error } = await ctx.supabase
    .from("documentos_corporativos")
    .insert({
      empresa_perfil_id: params.id,
      organization_id: ctx.organizationId,
      tipo: body.tipo,
      nombre: body.nombre,
      storage_path: body.storage_path,
      vigencia_hasta: body.vigencia_hasta ?? null,
    })
    .select()
    .single();

  if (error) throw ApiError.internal();
  return { data, status: 201 };
});
