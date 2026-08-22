import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  const { documento_id } = await request.json();
  if (!documento_id) {
    return NextResponse.json({ error: "documento_id requerido" }, { status: 400 });
  }

  const { data: documento } = await supabase
    .from("documentos")
    .select("id, licitacion_id")
    .eq("id", documento_id)
    .eq("licitacion_id", id)
    .single();

  if (!documento) {
    return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });
  }

  const { data, error } = await supabase.functions.invoke("procesar-documento", {
    body: { documento_id },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
