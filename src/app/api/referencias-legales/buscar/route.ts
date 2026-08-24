import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const q = request.nextUrl.searchParams.get("q")?.trim();
  const referenciaId = request.nextUrl.searchParams.get("referencia_id") || null;
  if (!q) {
    return NextResponse.json({ error: "q requerido" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("buscar_referencias_texto", {
    query_text: q,
    referencia_legal_id_param: referenciaId,
    match_count: 20,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: data ?? [] });
}
