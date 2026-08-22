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
    .from("seguimiento")
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
  if (typeof body.lecciones_aprendidas === "string") update.lecciones_aprendidas = body.lecciones_aprendidas;
  if (Array.isArray(body.tags_json)) update.tags_json = body.tags_json;
  if (typeof body.acta_apertura_tecnica_documento_id === "string")
    update.acta_apertura_tecnica_documento_id = body.acta_apertura_tecnica_documento_id;
  if (typeof body.acta_apertura_economica_documento_id === "string")
    update.acta_apertura_economica_documento_id = body.acta_apertura_economica_documento_id;

  const { data: existente } = await supabase
    .from("seguimiento")
    .select("id")
    .eq("licitacion_id", id)
    .maybeSingle();

  let result;
  if (existente) {
    result = await supabase.from("seguimiento").update(update).eq("id", existente.id).select().single();
  } else {
    result = await supabase
      .from("seguimiento")
      .insert({ licitacion_id: id, ...update })
      .select()
      .single();
  }

  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
  return NextResponse.json({ data: result.data });
}
