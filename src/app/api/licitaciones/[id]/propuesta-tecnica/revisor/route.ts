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

  const { data: actual } = await supabase
    .from("propuestas")
    .select("id, created_by, revisor_id")
    .eq("licitacion_id", id)
    .eq("tipo", "TECNICA")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!actual) {
    return NextResponse.json({ error: "No hay propuesta técnica generada" }, { status: 404 });
  }

  const body = await request.json();

  if (body.action === "asignar") {
    if (!body.revisor_id) {
      return NextResponse.json({ error: "revisor_id requerido" }, { status: 400 });
    }
    if (body.revisor_id === actual.created_by) {
      return NextResponse.json(
        { error: "El revisor debe ser distinto de quien elaboró la propuesta (doble check, Paso 17)" },
        { status: 400 },
      );
    }
    const { data, error } = await supabase
      .from("propuestas")
      .update({ revisor_id: body.revisor_id, revisado_at: null })
      .eq("id", actual.id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  }

  if (body.action === "confirmar") {
    if (!actual.revisor_id) {
      return NextResponse.json({ error: "Asigna primero un revisor" }, { status: 400 });
    }
    if (actual.revisor_id !== user.id) {
      return NextResponse.json(
        { error: "Solo el revisor asignado puede confirmar la revisión" },
        { status: 403 },
      );
    }
    const { data, error } = await supabase
      .from("propuestas")
      .update({ revisado_at: new Date().toISOString() })
      .eq("id", actual.id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  }

  return NextResponse.json({ error: "action inválida" }, { status: 400 });
}
