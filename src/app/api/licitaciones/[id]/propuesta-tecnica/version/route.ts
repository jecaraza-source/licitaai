import { z } from "zod";
import { apiRoute, ApiError, requireWriteRole } from "@/lib/api";

const paramsSchema = z.object({ id: z.string().uuid("id debe ser un UUID válido") });
const bodySchema = z.object({ nombre_version: z.string().trim().max(200).nullable().optional() });

export const POST = apiRoute({ paramsSchema, bodySchema }, async ({ ctx, params, body }) => {
  requireWriteRole(ctx);

  const { data: actual } = await ctx.supabase
    .from("propuestas")
    .select("*")
    .eq("licitacion_id", params.id)
    .eq("tipo", "TECNICA")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!actual) throw ApiError.notFound("No hay propuesta técnica generada");

  const { data, error } = await ctx.supabase
    .from("propuestas")
    .insert({
      licitacion_id: params.id,
      tipo: "TECNICA",
      version: actual.version + 1,
      estado: actual.estado,
      contenido_json: actual.contenido_json,
      nombre_version: body.nombre_version || null,
      created_by: ctx.userId,
    })
    .select()
    .single();

  if (error) throw ApiError.internal();

  await ctx.supabase.from("actividad_log").insert({
    licitacion_id: params.id,
    user_id: ctx.userId,
    accion: "version_propuesta_tecnica",
    metadata_json: { version: data.version, nombre_version: body.nombre_version },
  });

  return { data };
});
