import { z } from "zod";
import { apiRoute, ApiError, requireWriteRole } from "@/lib/api";
import { SELECT_DETALLE, aDetalle, type FilaCorreoConJoins } from "../compartido";

const paramsSchema = z.object({ id: z.string().uuid("id debe ser un UUID válido") });

export const GET = apiRoute({ paramsSchema }, async ({ ctx, params }) => {
  const { data, error } = await ctx.supabase
    .from("correos_compras_mx")
    .select(SELECT_DETALLE)
    .eq("id", params.id)
    .maybeSingle();
  if (error) throw ApiError.internal();
  if (!data) throw ApiError.notFound("Correo no encontrado");
  return { data: aDetalle(data as unknown as FilaCorreoConJoins) };
});

// Gestionar un correo: asociarlo a una licitación, descartarlo o devolverlo a
// la bandeja. Solo cambia el estado de gestión; el contenido recibido es
// evidencia y no se puede editar (lo garantiza también un trigger en la base).
const bodySchema = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("asociar"), licitacion_id: z.string().uuid("licitacion_id debe ser un UUID válido") }),
  z.object({ accion: z.literal("descartar") }),
  z.object({ accion: z.literal("restaurar") }),
]);

export const PATCH = apiRoute({ paramsSchema, bodySchema }, async ({ ctx, params, body }) => {
  requireWriteRole(ctx);

  const { data: correo } = await ctx.supabase
    .from("correos_compras_mx")
    .select("id, asunto")
    .eq("id", params.id)
    .maybeSingle();
  if (!correo) throw ApiError.notFound("Correo no encontrado");

  const gestion = { gestionado_por: ctx.userId, gestionado_en: new Date().toISOString() };
  let cambios;
  if (body.accion === "asociar") {
    // RLS ya limita a las licitaciones de la organización; aquí se da un error claro.
    const { data: licitacion } = await ctx.supabase
      .from("licitaciones")
      .select("id")
      .eq("id", body.licitacion_id)
      .maybeSingle();
    if (!licitacion) throw ApiError.notFound("Licitación no encontrada");
    cambios = { estado: "ASOCIADO", licitacion_id: body.licitacion_id, ...gestion };
  } else if (body.accion === "descartar") {
    cambios = { estado: "DESCARTADO", licitacion_id: null, ...gestion };
  } else {
    cambios = { estado: "PENDIENTE", licitacion_id: null, gestionado_por: null, gestionado_en: null };
  }

  const { error } = await ctx.supabase.from("correos_compras_mx").update(cambios).eq("id", params.id);
  if (error) throw ApiError.internal();

  if (body.accion === "asociar") {
    // Queda en el historial de la licitación, como el resto de sus cambios.
    await ctx.supabase.from("actividad_log").insert({
      licitacion_id: body.licitacion_id,
      user_id: ctx.userId,
      accion: "correo_asociado",
      metadata_json: { correo_id: params.id, asunto: correo.asunto },
    });
  }

  const { data } = await ctx.supabase
    .from("correos_compras_mx")
    .select(SELECT_DETALLE)
    .eq("id", params.id)
    .maybeSingle();
  return { data: data ? aDetalle(data as unknown as FilaCorreoConJoins) : null };
});
