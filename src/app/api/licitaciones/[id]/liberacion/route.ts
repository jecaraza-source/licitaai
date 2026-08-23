import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildItemsLiberacion, getGateStatus } from "@/lib/liberacion";
import type { ChecklistLiberacionItem } from "@/types";

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

  const data = await getGateStatus(supabase, id);
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

  const { itemId, checked } = await request.json();
  if (typeof itemId !== "string" || typeof checked !== "boolean") {
    return NextResponse.json({ error: "itemId y checked son requeridos" }, { status: 400 });
  }

  const [{ data: existente }, { data: licitacion }] = await Promise.all([
    supabase
      .from("checklist_liberacion")
      .select("items_json")
      .eq("licitacion_id", id)
      .maybeSingle(),
    supabase.from("licitaciones").select("es_investigacion_mercado").eq("id", id).maybeSingle(),
  ]);

  const actuales = buildItemsLiberacion(
    (existente?.items_json as ChecklistLiberacionItem[]) ?? [],
    licitacion?.es_investigacion_mercado ?? false,
  );
  const actualizados = actuales.map((i) => (i.id === itemId ? { ...i, checked } : i));

  const { error } = await supabase
    .from("checklist_liberacion")
    .upsert({ licitacion_id: id, items_json: actualizados }, { onConflict: "licitacion_id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const data = await getGateStatus(supabase, id);
  return NextResponse.json({ data });
}
