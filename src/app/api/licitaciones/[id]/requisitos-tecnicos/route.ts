import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
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

  const { data, error } = await supabase
    .from("requisitos_tecnicos")
    .select("*, documentos(id, nombre)")
    .eq("licitacion_id", id)
    .order("orden");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

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

  const body = await request.json();
  const requisito = typeof body.requisito === "string" ? body.requisito.trim() : "";
  if (!requisito) {
    return NextResponse.json({ error: "requisito requerido" }, { status: 400 });
  }

  const { count } = await supabase
    .from("requisitos_tecnicos")
    .select("id", { count: "exact", head: true })
    .eq("licitacion_id", id);

  const { data, error } = await supabase
    .from("requisitos_tecnicos")
    .insert({
      licitacion_id: id,
      orden: count ?? 0,
      requisito,
      obligatorio: body.obligatorio !== false,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
