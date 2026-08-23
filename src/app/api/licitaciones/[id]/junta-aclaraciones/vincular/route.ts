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

  const { itemIds } = await request.json();
  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    return NextResponse.json({ error: "itemIds requerido" }, { status: 400 });
  }

  const { data: junta } = await supabase
    .from("junta_aclaraciones")
    .select("id")
    .eq("licitacion_id", id)
    .maybeSingle();

  if (!junta) {
    return NextResponse.json({ error: "No hay junta de aclaraciones para esta licitación" }, { status: 404 });
  }

  const { data: items } = await supabase
    .from("checklist_items")
    .select("id, estado, fuente")
    .in("id", itemIds)
    .eq("licitacion_id", id);

  for (const item of items ?? []) {
    await supabase
      .from("checklist_items")
      .update({
        aclaracion_id: junta.id,
        estado: item.estado === "VERDE" ? "AMARILLO" : item.estado,
        fuente: item.fuente ? `${item.fuente} · Aclaración` : "Aclaración",
      })
      .eq("id", item.id);
  }

  await supabase.from("actividad_log").insert({
    licitacion_id: id,
    user_id: user.id,
    accion: "requisitos_vinculados_aclaracion",
    metadata_json: { cantidad: items?.length ?? 0 },
  });

  return NextResponse.json({ ok: true, actualizados: items?.length ?? 0 });
}
