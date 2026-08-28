import { z } from "zod";
import { apiRoute, ApiError, requireRole } from "@/lib/api";

const paramsSchema = z.object({ userId: z.string().uuid("userId debe ser un UUID válido") });

const bodySchema = z
  .object({
    rol_jerarquico: z.enum(["EJECUTOR", "INTEGRADOR", "SUPERVISOR"]).nullable(),
  })
  .strict();

export const PATCH = apiRoute(
  { paramsSchema, bodySchema },
  async ({ ctx, params, body }) => {
    requireRole(ctx, ["ADMIN"]);

    const { data, error } = await ctx.supabase
      .from("users")
      .update({ rol_jerarquico: body.rol_jerarquico })
      .eq("id", params.userId)
      .eq("organization_id", ctx.organizationId)
      .select("id, nombre, email, rol_jerarquico")
      .maybeSingle();

    if (error) throw ApiError.internal();
    if (!data) throw ApiError.notFound("Usuario no encontrado en tu organización");
    return { data };
  },
);
