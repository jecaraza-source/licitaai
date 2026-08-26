import { z } from "zod";
import { apiRoute, ApiError, requireWriteRole } from "@/lib/api";

const paramsSchema = z.object({ id: z.string().uuid("id debe ser un UUID válido") });

export const POST = apiRoute(
  { paramsSchema, rateLimit: { ruta: "auditar-todos", max: 5 } },
  async ({ ctx, params }) => {
    requireWriteRole(ctx);

    const { data: items } = await ctx.supabase
      .from("checklist_items")
      .select("id, documento_id")
      .eq("licitacion_id", params.id)
      .not("documento_id", "is", null);

    // Fan-out de N invocaciones de IA sin revisar el resultado individual —
    // mismo comportamiento que el código original; limitar/instrumentar
    // este fan-out es alcance de P1.2, no de esta migración.
    for (const item of items ?? []) {
      await ctx.supabase.functions.invoke("auditar-documento", {
        body: { documento_id: item.documento_id, checklist_item_id: item.id },
      });
    }

    const { data, error } = await ctx.supabase.functions.invoke("auditar-expediente", {
      body: { licitacion_id: params.id },
    });

    if (error) throw ApiError.upstream();

    return { data };
  },
);
