import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function POST(
  request: NextRequest,
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
  if (!(await checkRateLimit(supabase, "estudio-mercado"))) {
    return rateLimitResponse();
  }

  const { data: licitacion } = await supabase
    .from("licitaciones")
    .select("id")
    .eq("id", id)
    .single();
  if (!licitacion) {
    return NextResponse.json({ error: "Licitación no encontrada" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const partida_id = typeof body.partida_id === "string" ? body.partida_id : undefined;

  const { data, error } = await supabase.functions.invoke("generar-estudio-mercado", {
    body: { licitacion_id: id, partida_id },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
