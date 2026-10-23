import { z } from "zod";
import { apiRoute, ApiError, requireWriteRole } from "@/lib/api";
import { CARPETA_VALUES } from "@/lib/compras-mx";

// Paso 2 — carpeta controlada del expediente: lista los documentos con su
// carpeta (01–11) y permite asignarla.

const paramsSchema = z.object({ id: z.string().uuid("id debe ser un UUID válido") });

const patchSchema = z.object({
  documento_id: z.string().uuid("documento_id debe ser un UUID válido"),
  carpeta: z.enum(CARPETA_VALUES).nullable(),
});

export const GET = apiRoute({ paramsSchema }, async ({ ctx, params }) => {
  const { data, error } = await ctx.supabase
    .from("documentos")
    .select("id, nombre, tipo_documento, carpeta")
    .eq("licitacion_id", params.id)
    .order("created_at", { ascending: false });
  if (error) throw ApiError.internal();
  return { data: data ?? [] };
});

export const PATCH = apiRoute({ paramsSchema, bodySchema: patchSchema }, async ({ ctx, params, body }) => {
  requireWriteRole(ctx);

  // licitacion_id en el filtro: un documento de otra licitación no se toca
  // aunque el cliente conozca su id.
  const { data, error } = await ctx.supabase
    .from("documentos")
    .update({ carpeta: body.carpeta })
    .eq("id", body.documento_id)
    .eq("licitacion_id", params.id)
    .select("id, nombre, tipo_documento, carpeta")
    .maybeSingle();
  if (error) throw ApiError.internal();
  if (!data) throw ApiError.notFound("Documento no encontrado");

  return { data };
});
