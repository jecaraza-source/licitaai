import { z } from "zod";
import { apiRoute, ApiError, requireWriteRole } from "@/lib/api";
import { buildItemsLiberacion, getGateStatus } from "@/lib/liberacion";
import type { ChecklistLiberacionItem } from "@/types";

const paramsSchema = z.object({ id: z.string().uuid("id debe ser un UUID válido") });
const putBodySchema = z.object({
  itemId: z.string().min(1, "itemId y checked son requeridos"),
  checked: z.boolean(),
});

export const GET = apiRoute({ paramsSchema }, async ({ ctx, params }) => {
  const data = await getGateStatus(ctx.supabase, params.id, ctx.organizationId);
  return { data };
});

export const PUT = apiRoute({ paramsSchema, bodySchema: putBodySchema }, async ({ ctx, params, body }) => {
  requireWriteRole(ctx);

  const [{ data: existente }, { data: licitacion }] = await Promise.all([
    ctx.supabase
      .from("checklist_liberacion")
      .select("items_json")
      .eq("licitacion_id", params.id)
      .maybeSingle(),
    ctx.supabase.from("licitaciones").select("es_investigacion_mercado").eq("id", params.id).maybeSingle(),
  ]);

  const actuales = buildItemsLiberacion(
    (existente?.items_json as ChecklistLiberacionItem[]) ?? [],
    licitacion?.es_investigacion_mercado ?? false,
  );
  const actualizados = actuales.map((i) => (i.id === body.itemId ? { ...i, checked: body.checked } : i));

  const { error } = await ctx.supabase
    .from("checklist_liberacion")
    .upsert({ licitacion_id: params.id, items_json: actualizados }, { onConflict: "licitacion_id" });

  if (error) throw ApiError.internal();

  const data = await getGateStatus(ctx.supabase, params.id, ctx.organizationId);
  return { data };
});
