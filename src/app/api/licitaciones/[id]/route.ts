import { z } from "zod";
import { apiRoute, ApiError, requireWriteRole } from "@/lib/api";
import { licitacionSchema } from "@/lib/validations/licitacion";

const paramsSchema = z.object({ id: z.string().uuid("id debe ser un UUID válido") });

const patchSchema = z.object({
  convocante_representante_nombre: z.string().trim().max(300).nullable().optional(),
  convocante_representante_cargo: z.string().trim().max(300).nullable().optional(),
});

export const GET = apiRoute({ paramsSchema }, async ({ ctx, params }) => {
  const { data, error } = await ctx.supabase
    .from("licitaciones")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();

  if (error) throw ApiError.internal();
  if (!data) throw ApiError.notFound("Licitación no encontrada");

  return { data };
});

export const PUT = apiRoute(
  { paramsSchema, bodySchema: licitacionSchema.partial() },
  async ({ ctx, params, body }) => {
    requireWriteRole(ctx);

    const { data, error } = await ctx.supabase
      .from("licitaciones")
      .update(body)
      .eq("id", params.id)
      .select()
      .single();

    if (error) throw ApiError.notFound("Licitación no encontrada");

    await ctx.supabase.from("actividad_log").insert({
      licitacion_id: params.id,
      user_id: ctx.userId,
      accion: "edicion",
      metadata_json: { campos: Object.keys(body) },
    });

    return { data };
  },
);

export const PATCH = apiRoute({ paramsSchema, bodySchema: patchSchema }, async ({ ctx, params, body }) => {
  requireWriteRole(ctx);

  const update = {
    convocante_representante_nombre: body.convocante_representante_nombre ?? null,
    convocante_representante_cargo: body.convocante_representante_cargo ?? null,
  };

  const { data, error } = await ctx.supabase
    .from("licitaciones")
    .update(update)
    .eq("id", params.id)
    .select("convocante_representante_nombre, convocante_representante_cargo")
    .single();

  if (error) throw ApiError.notFound("Licitación no encontrada");

  return { data };
});

export const DELETE = apiRoute({ paramsSchema }, async ({ ctx, params }) => {
  requireWriteRole(ctx);

  // No se registra en actividad_log: licitacion_id ahí tiene
  // `references licitaciones(id) on delete cascade` — cualquier fila de
  // actividad_log para esta licitación se borra en cascada junto con ella,
  // así que un insert posterior al delete violaría la FK (la fila padre ya
  // no existe) y uno previo dejaría un registro de "eliminación" fantasma
  // si el delete fallara después.
  const { error } = await ctx.supabase.from("licitaciones").delete().eq("id", params.id);
  if (error) throw ApiError.notFound("Licitación no encontrada");

  return { data: { ok: true } };
});
