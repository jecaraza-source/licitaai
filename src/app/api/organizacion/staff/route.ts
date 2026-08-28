import { apiRoute, ApiError } from "@/lib/api";

export const GET = apiRoute({}, async ({ ctx }) => {
  // El email es información sensible: solo un ADMIN (que es quien invita y
  // asigna rangos) lo necesita. Cualquier otro miembro solo ve nombre y rango.
  const esAdmin = ctx.rol === "ADMIN";

  const [{ data: staff, error }, { data: invitaciones }] = await Promise.all([
    ctx.supabase
      .from("users")
      .select(
        esAdmin
          ? "id, nombre, email, rol_jerarquico, created_at"
          : "id, nombre, rol_jerarquico, created_at",
      )
      .eq("organization_id", ctx.organizationId)
      .order("nombre"),
    esAdmin
      ? ctx.supabase
          .from("invitaciones_staff")
          .select("id, email, rol_jerarquico, created_at, expires_at")
          .eq("organization_id", ctx.organizationId)
          .is("aceptada_at", null)
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as never[] }),
  ]);

  if (error) throw ApiError.internal();

  return {
    data: {
      miembros: staff ?? [],
      invitacionesPendientes: invitaciones ?? [],
      puedeInvitar: esAdmin,
    },
  };
});
