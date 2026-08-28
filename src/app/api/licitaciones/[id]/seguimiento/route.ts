import { z } from "zod";
import { apiRoute, ApiError, requireWriteRole } from "@/lib/api";

const paramsSchema = z.object({ id: z.string().uuid("id debe ser un UUID válido") });

// Todos opcionales — es una actualización parcial, solo se aplican los
// campos que el cliente realmente envía. A diferencia del código original
// (que silenciosamente OMITÍA un campo con el tipo incorrecto en vez de
// rechazar la solicitud), aquí un campo presente pero mal tipado hace que
// Zod rechace toda la solicitud con 400 — más predecible que aplicar una
// actualización parcial sin avisar al cliente qué se ignoró.
const putBodySchema = z.object({
  lecciones_aprendidas: z.string().optional(),
  tags_json: z.array(z.unknown()).optional(),
  acta_apertura_tecnica_documento_id: z.string().optional(),
  acta_apertura_economica_documento_id: z.string().optional(),
  contrato_documento_id: z.string().nullable().optional(),
  garantia_documento_id: z.string().nullable().optional(),
  fianza_documento_id: z.string().nullable().optional(),
  administrador_contrato_id: z.string().nullable().optional(),
  vigencia_inicio: z.string().nullable().optional(),
  vigencia_fin: z.string().nullable().optional(),
  orden_suministro: z.string().nullable().optional(),
  lugar_entrega: z.string().nullable().optional(),
  penalizaciones: z.string().nullable().optional(),
  niveles_servicio: z.string().nullable().optional(),
});

export const GET = apiRoute({ paramsSchema }, async ({ ctx, params }) => {
  const { data, error } = await ctx.supabase
    .from("seguimiento")
    .select("*")
    .eq("licitacion_id", params.id)
    .maybeSingle();

  if (error) throw ApiError.internal();
  return { data };
});

export const PUT = apiRoute({ paramsSchema, bodySchema: putBodySchema }, async ({ ctx, params, body }) => {
  requireWriteRole(ctx);

  const update = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));

  const { data: existente } = await ctx.supabase
    .from("seguimiento")
    .select("id")
    .eq("licitacion_id", params.id)
    .maybeSingle();

  const result = existente
    ? await ctx.supabase.from("seguimiento").update(update).eq("id", existente.id).select().single()
    : await ctx.supabase
        .from("seguimiento")
        .insert({ licitacion_id: params.id, ...update })
        .select()
        .single();

  if (result.error) throw ApiError.internal();
  return { data: result.data };
});
