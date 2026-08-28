import { apiRoute, ApiError } from "@/lib/api";

export const GET = apiRoute({}, async ({ ctx }) => {
  const { data, error } = await ctx.supabase
    .from("users")
    .select("id, nombre")
    .eq("organization_id", ctx.organizationId)
    .order("nombre");

  if (error) throw ApiError.internal();
  return { data: data ?? [] };
});
