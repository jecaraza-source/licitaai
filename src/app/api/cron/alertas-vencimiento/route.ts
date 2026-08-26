import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/resend";
import { LicitacionPorVencerEmail } from "@/emails/licitacion-por-vencer";
import { estaAutorizadoCron } from "@/lib/cron-auth";

// Ejecutado por Vercel Cron (ver vercel.json). Usa el service role porque
// corre sin sesión de usuario y necesita leer/escribir entre organizaciones.
export async function GET(request: NextRequest) {
  if (!estaAutorizadoCron(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const { data: licitaciones, error } = await supabase
    .from("licitaciones")
    .select("id, numero_expediente, titulo, fecha_entrega_propuesta, organization_id")
    .not("estado_licitacion", "in", "(ENVIADA,CERRADA)")
    .gte("fecha_entrega_propuesta", now.toISOString())
    .lte("fecha_entrega_propuesta", in7Days.toISOString())
    .is("alerta_vencimiento_enviada_at", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let enviados = 0;
  for (const licitacion of licitaciones ?? []) {
    const { data: usuarios } = await supabase
      .from("users")
      .select("email")
      .eq("organization_id", licitacion.organization_id);

    const diasRestantes = Math.ceil(
      (new Date(licitacion.fecha_entrega_propuesta!).getTime() - now.getTime()) /
        (1000 * 60 * 60 * 24),
    );

    for (const usuario of usuarios ?? []) {
      await sendEmail({
        to: usuario.email,
        subject: `${licitacion.titulo} vence en ${diasRestantes} días`,
        react: LicitacionPorVencerEmail({
          titulo: licitacion.titulo,
          numeroExpediente: licitacion.numero_expediente,
          diasRestantes,
          url: `${appUrl}/licitaciones/${licitacion.id}`,
        }),
      });
    }

    await supabase
      .from("licitaciones")
      .update({ alerta_vencimiento_enviada_at: now.toISOString() })
      .eq("id", licitacion.id);

    enviados++;
  }

  return NextResponse.json({ ok: true, licitaciones_notificadas: enviados });
}
