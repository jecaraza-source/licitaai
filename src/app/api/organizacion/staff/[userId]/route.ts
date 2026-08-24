import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ROLES_VALIDOS = ["EJECUTOR", "INTEGRADOR", "SUPERVISOR"];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;
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
  if (!perfil || perfil.rol !== "ADMIN") {
    return NextResponse.json(
      { error: "Solo un administrador puede editar el rol jerárquico" },
      { status: 403 },
    );
  }

  const { rol_jerarquico } = await request.json();
  if (rol_jerarquico !== null && !ROLES_VALIDOS.includes(rol_jerarquico)) {
    return NextResponse.json({ error: "Rol jerárquico inválido" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("users")
    .update({ rol_jerarquico })
    .eq("id", userId)
    .eq("organization_id", perfil.organization_id)
    .select("id, nombre, email, rol_jerarquico")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
