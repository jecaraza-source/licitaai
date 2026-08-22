import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/resend";
import { AnalisisCompletadoEmail } from "@/emails/analisis-completado";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (!(await checkRateLimit(supabase, "analizar-bases"))) {
    return rateLimitResponse();
  }

  const { data: licitacion } = await supabase
    .from("licitaciones")
    .select("id, numero_expediente, titulo")
    .eq("id", id)
    .single();

  if (!licitacion) {
    return NextResponse.json({ error: "Licitación no encontrada" }, { status: 404 });
  }

  const { data, error } = await supabase.functions.invoke("analizar-bases", {
    body: { licitacion_id: id },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (user.email) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    sendEmail({
      to: user.email,
      subject: `Análisis completado — ${licitacion.numero_expediente}`,
      react: AnalisisCompletadoEmail({
        titulo: licitacion.titulo,
        numeroExpediente: licitacion.numero_expediente,
        nivelConfianza: data?.data?.nivel_confianza ?? "N/D",
        url: `${appUrl}/licitaciones/${id}`,
      }),
    }).catch(() => {});
  }

  return NextResponse.json({ data });
}
