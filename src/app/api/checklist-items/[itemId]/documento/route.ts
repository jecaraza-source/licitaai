import { z } from "zod";
import { apiRoute, ApiError, requireWriteRole } from "@/lib/api";

const paramsSchema = z.object({ itemId: z.string().uuid("itemId debe ser un UUID válido") });
const bodySchema = z.object({ documento_id: z.string().uuid("documento_id debe ser un UUID válido") });

export const POST = apiRoute(
  { paramsSchema, bodySchema, rateLimit: { ruta: "checklist-items-documento", max: 20 } },
  async ({ ctx, params, body }) => {
    requireWriteRole(ctx);

    const { error: updateError } = await ctx.supabase
      .from("checklist_items")
      .update({ documento_id: body.documento_id })
      .eq("id", params.itemId);
    if (updateError) throw ApiError.internal();

    const { data, error } = await ctx.supabase.functions.invoke("auditar-documento", {
      body: { documento_id: body.documento_id, checklist_item_id: params.itemId },
    });

    if (error) throw ApiError.upstream();

    return { data };
  },
);
