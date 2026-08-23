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
    .from("evidencia_envio")
    .select("*, documentos(id, nombre), registrado_por_usuario:users!registrado_por(id, nombre)")
    .eq("licitacion_id", id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const normalizado = (data ?? []).map((row) => ({
    ...row,
    documento_nombre: row.documentos?.nombre ?? null,
    registrado_por_nombre: row.registrado_por_usuario?.nombre ?? null,
  }));

  return NextResponse.json({ data: normalizado });
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
  const { data, error } = await supabase
    .from("evidencia_envio")
    .insert({
      licitacion_id: id,
      documento_id: typeof body.documento_id === "string" ? body.documento_id : null,
      notas: typeof body.notas === "string" ? body.notas : null,
      registrado_por: user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("actividad_log").insert({
    licitacion_id: id,
    user_id: user.id,
    accion: "evidencia_envio_registrada",
    metadata_json: { evidencia_id: data.id },
  });

  return NextResponse.json({ data }, { status: 201 });
}
