import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const { itemId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = await request.json();
  const update: Record<string, unknown> = {};
  if (typeof body.requisito === "string") update.requisito = body.requisito;
  if (typeof body.obligatorio === "boolean") update.obligatorio = body.obligatorio;
  if (typeof body.cumple === "boolean" || body.cumple === null) update.cumple = body.cumple;
  if (typeof body.como_cumple === "string" || body.como_cumple === null) {
    update.como_cumple = body.como_cumple;
  }
  if (typeof body.evidencia === "string" || body.evidencia === null) {
    update.evidencia = body.evidencia;
  }
  if (typeof body.documento_id === "string" || body.documento_id === null) {
    update.documento_id = body.documento_id;
  }

  const { data, error } = await supabase
    .from("requisitos_tecnicos")
    .update(update)
    .eq("id", itemId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const { itemId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { error } = await supabase.from("requisitos_tecnicos").delete().eq("id", itemId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
