import { apiRoute, ApiError } from "@/lib/api";

// P2 · H5 — cancela un borrado dentro de la ventana de gracia (solo si
// sigue en PROGRAMADA). ADMIN.
export const POST = apiRoute(
  { rolesPermitidos: ["ADMIN"], rateLimit: { ruta: "org-borrar-cancelar", max: 10 } },
  async ({ ctx }) => {
    const { data, error } = await ctx.supabase.rpc("cancelar_borrado_organizacion");
    if (error) {
      if (error.code === "42501") throw ApiError.forbidden("Solo un ADMIN puede cancelar el borrado");
      if (error.code === "P0002") {
        throw ApiError.conflict("No hay un borrado cancelable (ya en proceso o inexistente)");
      }
      throw ApiError.internal();
    }
    return { data: { id: data.id, estado: data.estado } };
  },
);
