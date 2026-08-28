import { z } from "zod";
import { apiRoute, ApiError, requireWriteRole } from "@/lib/api";

const ESTADOS = ["VERDE", "AMARILLO", "ROJO", "GRIS"] as const;
const TIPOS_FORMATO = ["A", "B", "C", "D"] as const;

const paramsSchema = z.object({ itemId: z.string().uuid("itemId debe ser un UUID válido") });
// Igual criterio que seguimiento/route.ts y checklist-items: actualización
// parcial, cada campo opcional; un campo presente pero mal tipado ahora
// rechaza la solicitud completa (400) en vez de omitirse en silencio.
const patchBodySchema = z.object({
  estado: z.enum(ESTADOS).optional(),
  documento_id: z.string().nullable().optional(),
  critico: z.boolean().optional(),
  fuente: z.string().nullable().optional(),
  responsable_id: z.string().nullable().optional(),
  fecha_limite: z.string().nullable().optional(),
  causa_desechamiento: z.string().nullable().optional(),
  observaciones: z.string().nullable().optional(),
  tipo_formato: z.enum(TIPOS_FORMATO).nullable().optional(),
});

export const PATCH = apiRoute({ paramsSchema, bodySchema: patchBodySchema }, async ({ ctx, params, body }) => {
  requireWriteRole(ctx);

  const update = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));

  const { data, error } = await ctx.supabase
    .from("checklist_items")
    .update(update)
    .eq("id", params.itemId)
    .select()
    .single();

  if (error) throw ApiError.notFound("Elemento de checklist no encontrado");
  return { data };
});
