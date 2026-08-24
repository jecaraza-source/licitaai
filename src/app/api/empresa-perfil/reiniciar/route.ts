import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Limpia la empresa activa del usuario al iniciar sesión, para que
 * (dashboard)/layout.tsx lo mande a /seleccionar-empresa en vez de
 * reanudar silenciosamente la última empresa elegida.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { error } = await supabase
    .from("users")
    .update({ empresa_perfil_id: null })
    .eq("id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
