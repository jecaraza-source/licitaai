import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/resend";
import { InvitacionStaffEmail } from "@/emails/invitacion-staff";

const ROLES_VALIDOS = ["EJECUTOR", "INTEGRADOR", "SUPERVISOR"];

export async function POST(request: NextRequest) {
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
  if (perfil.rol !== "ADMIN") {
    return NextResponse.json(
      { error: "Solo un administrador puede invitar personas a la organización" },
      { status: 403 },
    );
  }

  const { email, rol_jerarquico } = await request.json();
  if (typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json({ error: "Correo inválido" }, { status: 400 });
  }
  if (!ROLES_VALIDOS.includes(rol_jerarquico)) {
    return NextResponse.json({ error: "Rol jerárquico inválido" }, { status: 400 });
  }

  const { data: organizacion } = await supabase
    .from("organizations")
    .select("nombre")
    .eq("id", perfil.organization_id)
    .single();

  const { data: invitacion, error } = await supabase
    .from("invitaciones_staff")
    .insert({
      organization_id: perfil.organization_id,
      email: email.toLowerCase().trim(),
      rol_jerarquico,
      invitado_por: user.id,
    })
    .select("token")
    .single();

  if (error || !invitacion) {
    return NextResponse.json({ error: error?.message ?? "No se pudo crear la invitación" }, { status: 500 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  await sendEmail({
    to: email,
    subject: `Te invitaron a unirte a ${organizacion?.nombre ?? "una organización"} en LicitaAI`,
    react: InvitacionStaffEmail({
      organizacionNombre: organizacion?.nombre ?? "tu organización",
      rolJerarquico: rol_jerarquico,
      url: `${appUrl}/invitacion/${invitacion.token}`,
    }),
  });

  return NextResponse.json({ ok: true });
}
