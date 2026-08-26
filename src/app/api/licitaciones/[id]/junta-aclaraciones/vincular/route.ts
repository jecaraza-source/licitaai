import { z } from "zod";
import { apiRoute, ApiError, requireWriteRole } from "@/lib/api";

const paramsSchema = z.object({ id: z.string().uuid("id debe ser un UUID válido") });
const bodySchema = z.object({
  itemIds: z.array(z.string().uuid()).min(1, "itemIds requerido"),
});

export const POST = apiRoute({ paramsSchema, bodySchema }, async ({ ctx, params, body }) => {
  requireWriteRole(ctx);

  const { data: junta } = await ctx.supabase
    .from("junta_aclaraciones")
    .select("id")
    .eq("licitacion_id", params.id)
    .maybeSingle();

  if (!junta) throw ApiError.notFound("No hay junta de aclaraciones para esta licitación");

  const { data: items } = await ctx.supabase
    .from("checklist_items")
    .select("id, estado, fuente")
    .in("id", body.itemIds)
    .eq("licitacion_id", params.id);

  for (const item of items ?? []) {
    await ctx.supabase
      .from("checklist_items")
      .update({
        aclaracion_id: junta.id,
        estado: item.estado === "VERDE" ? "AMARILLO" : item.estado,
        fuente: item.fuente ? `${item.fuente} · Aclaración` : "Aclaración",
      })
      .eq("id", item.id);
  }

  await ctx.supabase.from("actividad_log").insert({
    licitacion_id: params.id,
    user_id: ctx.userId,
    accion: "requisitos_vinculados_aclaracion",
    metadata_json: { cantidad: items?.length ?? 0 },
  });

  return { data: { ok: true, actualizados: items?.length ?? 0 } };
});
