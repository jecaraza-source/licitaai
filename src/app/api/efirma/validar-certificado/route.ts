import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseCertificado } from "@/lib/efirma";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { cer_base64 } = await request.json();
  if (!cer_base64) {
    return NextResponse.json({ error: "cer_base64 requerido" }, { status: 400 });
  }

  try {
    const info = parseCertificado(cer_base64);
    return NextResponse.json({ data: info });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo leer el certificado" },
      { status: 400 },
    );
  }
}
