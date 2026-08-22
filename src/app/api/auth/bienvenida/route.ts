import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/resend";
import { BienvenidaEmail } from "@/emails/bienvenida";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { email, nombre } = await request.json();
  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "email requerido" }, { status: 400 });
  }

  // Solo se envía si hay una sesión real que corresponde a ese correo — evita
  // que este endpoint se use como relay de spam hacia direcciones arbitrarias.
  if (!user || user.email !== email) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  await sendEmail({
    to: email,
    subject: "Bienvenido a LicitaAI",
    react: BienvenidaEmail({ nombre: nombre || email }),
  });

  return NextResponse.json({ ok: true });
}
