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
    .from("junta_aclaraciones")
    .select("*")
    .eq("licitacion_id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function PUT(
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
  const update: Record<string, unknown> = {};
  if (Array.isArray(body.preguntas_json)) update.preguntas_json = body.preguntas_json;
  if (typeof body.estado === "string") update.estado = body.estado;

  const { data: existente } = await supabase
    .from("junta_aclaraciones")
    .select("id")
    .eq("licitacion_id", id)
    .maybeSingle();

  let result;
  if (existente) {
    result = await supabase
      .from("junta_aclaraciones")
      .update(update)
      .eq("id", existente.id)
      .select()
      .single();
  } else {
    result = await supabase
      .from("junta_aclaraciones")
      .insert({ licitacion_id: id, ...update })
      .select()
      .single();
  }

  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
  return NextResponse.json({ data: result.data });
}
