import { z } from "zod";
import { apiRoute, ApiError, requireWriteRole } from "@/lib/api";

// Paso 5 — desglose de requisitos compuestos: crea un sub-ítem ligado a un
// requisito de la matriz (p. ej. "5 especialistas" → "CV" → "comprobante").
// Un solo nivel de profundidad; lo garantiza el trigger
// `_checklist_padre_valido`, aquí solo se heredan los datos del padre.

const paramsSchema = z.object({ id: z.string().uuid("id debe ser un UUID válido") });

const postSchema = z.object({
  padre_id: z.string().uuid("padre_id debe ser un UUID válido"),
  descripcion: z.string().trim().min(1, "La descripción es obligatoria").max(500),
});

export const POST = apiRoute({ paramsSchema, bodySchema: postSchema }, async ({ ctx, params, body }) => {
  requireWriteRole(ctx);

  const { data: padre, error: errorPadre } = await ctx.supabase
    .from("checklist_items")
    .select("categoria, requerido, critico, fuente, pagina_fuente, fundamento_legal, vigencia_requerida, padre_id")
    .eq("id", body.padre_id)
    .eq("licitacion_id", params.id)
    .maybeSingle();
  if (errorPadre) throw ApiError.internal();
  if (!padre) throw ApiError.notFound("Requisito no encontrado");
  if (padre.padre_id) throw ApiError.validation("Un sub-requisito no puede tener sub-requisitos");

  const { data, error } = await ctx.supabase
    .from("checklist_items")
    .insert({
      licitacion_id: params.id,
      padre_id: body.padre_id,
      descripcion: body.descripcion,
      categoria: padre.categoria,
      requerido: padre.requerido,
      critico: padre.critico,
      fuente: padre.fuente,
      pagina_fuente: padre.pagina_fuente,
      fundamento_legal: padre.fundamento_legal,
      vigencia_requerida: padre.vigencia_requerida,
    })
    .select()
    .single();
  if (error) throw ApiError.validation("No se pudo crear el sub-requisito");

  return { data };
});
