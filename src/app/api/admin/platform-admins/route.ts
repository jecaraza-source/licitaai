import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { rolPlataforma } from "@/lib/platform-admin";

// Alta y listado de administradores/operadores de la plataforma (equipo
// LicitaAI). GET: cualquier admin u operador puede ver la lista. POST: solo
// un ADMIN puede invitar a alguien nuevo.
export const dynamic = "force-dynamic";

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Correo inválido"),
  nombre: z.string().trim().min(1, "El nombre es obligatorio").max(200),
  rol: z.enum(["ADMIN", "OPERADOR"]),
});

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET() {
  const sb = await createServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (!(await rolPlataforma(sb, user.id))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { data, error } = await sb
    .from("platform_admins")
    .select("id, email, nombre, rol, created_at")
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: "No se pudo leer la lista" }, { status: 500 });
  }
  return NextResponse.json({ data });
}

export async function POST(req: Request) {
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

  const parsed = inviteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
      { status: 400 },
    );
  }
  const { email, nombre, rol } = parsed.data;

  const service = serviceClient();
  if (!service) {
    return NextResponse.json({ error: "Configuración incompleta" }, { status: 500 });
  }

  const { data: existente } = await service
    .from("platform_admins")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (existente) {
    return NextResponse.json(
      { error: "Ese correo ya es admin u operador de la plataforma" },
      { status: 409 },
    );
  }

  // Si el correo ya tiene una cuenta de Supabase Auth (p. ej. es staff de
  // una organización cliente), inviteUserByEmail falla — en ese caso se
  // reutiliza esa cuenta existente en vez de crear una nueva.
  const invitacion = await service.auth.admin.inviteUserByEmail(email);
  let userId = invitacion.data.user?.id;
  if (invitacion.error || !userId) {
    const { data: listado, error: listError } = await service.auth.admin.listUsers();
    const existenteAuth = listError
      ? undefined
      : listado.users.find((u) => u.email?.toLowerCase() === email);
    if (!existenteAuth) {
      return NextResponse.json(
        { error: invitacion.error?.message ?? "No se pudo invitar" },
        { status: 500 },
      );
    }
    userId = existenteAuth.id;
  }

  const { data: fila, error: insertError } = await service
    .from("platform_admins")
    .insert({ id: userId, email, nombre, rol })
    .select("id, email, nombre, rol, created_at")
    .single();
  if (insertError) {
    return NextResponse.json(
      { error: "El usuario se invitó pero no se pudo registrar como admin de plataforma" },
      { status: 500 },
    );
  }

  return NextResponse.json({ data: fila });
}
