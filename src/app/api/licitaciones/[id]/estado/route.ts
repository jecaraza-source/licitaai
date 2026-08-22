import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { estadoLicitacionSchema } from "@/lib/validations/licitacion";

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

  const json = await request.json();
  const parsed = estadoLicitacionSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { data: anterior } = await supabase
    .from("licitaciones")
    .select("estado_licitacion")
    .eq("id", id)
    .single();

  const { data, error } = await supabase
    .from("licitaciones")
    .update({ estado_licitacion: parsed.data.estado_licitacion })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase.from("actividad_log").insert({
    licitacion_id: id,
    user_id: user.id,
    accion: "cambio_estado",
    metadata_json: {
      estado_anterior: anterior?.estado_licitacion ?? null,
      nuevo_estado: parsed.data.estado_licitacion,
    },
  });

  return NextResponse.json({ data });
}
