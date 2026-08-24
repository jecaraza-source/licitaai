import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { data: perfil } = await supabase
    .from("users")
    .select("organization_id, rol")
    .eq("id", user.id)
    .single();
  if (!perfil) {
    return NextResponse.json({ error: "Perfil no encontrado" }, { status: 403 });
  }

  const [{ data: staff, error }, { data: invitaciones }] = await Promise.all([
    supabase
      .from("users")
      .select("id, nombre, email, rol_jerarquico, created_at")
      .eq("organization_id", perfil.organization_id)
      .order("nombre"),
    supabase
      .from("invitaciones_staff")
      .select("id, email, rol_jerarquico, created_at, expires_at")
      .eq("organization_id", perfil.organization_id)
      .is("aceptada_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    data: staff ?? [],
    invitacionesPendientes: invitaciones ?? [],
    puedeInvitar: perfil.rol === "ADMIN",
  });
}
