import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { rolPlataforma } from "@/lib/platform-admin";

// Baja de un admin/operador de plataforma. Solo revoca el acceso al panel
// (borra la fila de platform_admins); no borra su cuenta de Supabase Auth,
// por si tiene otro rol legítimo (p. ej. staff de una organización cliente).
export const dynamic = "force-dynamic";

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if ((await rolPlataforma(sb, user.id)) !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const service = serviceClient();
  if (!service) {
    return NextResponse.json({ error: "Configuración incompleta" }, { status: 500 });
  }

  const { data: objetivo } = await service
    .from("platform_admins")
    .select("rol")
    .eq("id", id)
    .maybeSingle();
  if (!objetivo) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  if (objetivo.rol === "ADMIN") {
    const { count } = await service
      .from("platform_admins")
      .select("id", { count: "exact", head: true })
      .eq("rol", "ADMIN");
    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: "No puedes quitar al último admin de la plataforma" },
        { status: 409 },
      );
    }
  }

  const { error } = await service.from("platform_admins").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: "No se pudo quitar" }, { status: 500 });
  }
  return NextResponse.json({ data: { id } });
}
