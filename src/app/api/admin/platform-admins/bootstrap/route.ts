import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

// Crea el PRIMER admin de plataforma — un solo uso. Ninguna cuenta existe
// todavía para autorizar la invitación normal (POST /api/admin/platform-admins
// exige ser ya ADMIN), así que este endpoint se protege con un secreto
// aparte (PLATFORM_ADMIN_BOOTSTRAP_SECRET, mismo patrón que CRON_SECRET) y,
// además, se autodeshabilita en cuanto exista al menos una fila en
// platform_admins — no vuelve a funcionar aunque el secreto siga puesto.
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email("Correo inválido"),
  nombre: z.string().trim().min(1, "El nombre es obligatorio").max(200),
});

export async function POST(req: Request) {
  const secretoEsperado = process.env.PLATFORM_ADMIN_BOOTSTRAP_SECRET;
  if (!secretoEsperado) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
  const secretoRecibido = req.headers.get("x-bootstrap-secret");
  if (secretoRecibido !== secretoEsperado) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "Configuración incompleta" }, { status: 500 });
  }
  const service = createClient(url, key, { auth: { persistSession: false } });

  const { count } = await service
    .from("platform_admins")
    .select("id", { count: "exact", head: true });
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: "Ya existe al menos un admin de plataforma; usa la invitación normal" },
      { status: 409 },
    );
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
      { status: 400 },
    );
  }
  const { email, nombre } = parsed.data;

  const invitacion = await service.auth.admin.inviteUserByEmail(email);
  if (invitacion.error || !invitacion.data.user) {
    return NextResponse.json(
      { error: invitacion.error?.message ?? "No se pudo invitar" },
      { status: 500 },
    );
  }

  const { data: fila, error: insertError } = await service
    .from("platform_admins")
    .insert({ id: invitacion.data.user.id, email, nombre, rol: "ADMIN" })
    .select("id, email, nombre, rol, created_at")
    .single();
  if (insertError) {
    return NextResponse.json({ error: "No se pudo registrar" }, { status: 500 });
  }

  return NextResponse.json({ data: fila });
}
