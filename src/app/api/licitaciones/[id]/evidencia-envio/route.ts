import { z } from "zod";
import { apiRoute, ApiError, requireWriteRole } from "@/lib/api";

const paramsSchema = z.object({ id: z.string().uuid("id debe ser un UUID válido") });
const bodySchema = z.object({
  documento_id: z.string().uuid().nullable().optional(),
  notas: z.string().trim().max(2000).nullable().optional(),
});

export const GET = apiRoute({ paramsSchema }, async ({ ctx, params }) => {
  const { data, error } = await ctx.supabase
    .from("evidencia_envio")
    .select("*, documentos(id, nombre), registrado_por_usuario:users!registrado_por(id, nombre)")
    .eq("licitacion_id", params.id)
    .order("created_at", { ascending: false });

  if (error) throw ApiError.internal();

  const normalizado = (data ?? []).map((row) => ({
    ...row,
    documento_nombre: row.documentos?.nombre ?? null,
    registrado_por_nombre: row.registrado_por_usuario?.nombre ?? null,
  }));

  return { data: normalizado };
});

export const POST = apiRoute({ paramsSchema, bodySchema }, async ({ ctx, params, body }) => {
  requireWriteRole(ctx);

  const { data, error } = await ctx.supabase
    .from("evidencia_envio")
    .insert({
      licitacion_id: params.id,
      documento_id: body.documento_id ?? null,
      notas: body.notas ?? null,
      registrado_por: ctx.userId,
    })
    .select()
    .single();

  if (error) throw ApiError.internal();

  await ctx.supabase.from("actividad_log").insert({
    licitacion_id: params.id,
    user_id: ctx.userId,
    accion: "evidencia_envio_registrada",
    metadata_json: { evidencia_id: data.id },
  });

  return { data, status: 201 };
});
