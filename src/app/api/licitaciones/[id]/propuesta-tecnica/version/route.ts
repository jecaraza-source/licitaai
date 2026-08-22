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

  const { nombre_version } = await request.json().catch(() => ({}));

  const { data: actual } = await supabase
    .from("propuestas")
    .select("*")
    .eq("licitacion_id", id)
    .eq("tipo", "TECNICA")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!actual) {
    return NextResponse.json({ error: "No hay propuesta técnica generada" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("propuestas")
    .insert({
      licitacion_id: id,
      tipo: "TECNICA",
      version: actual.version + 1,
      estado: actual.estado,
      contenido_json: actual.contenido_json,
      nombre_version: nombre_version || null,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("actividad_log").insert({
    licitacion_id: id,
    user_id: user.id,
    accion: "version_propuesta_tecnica",
    metadata_json: { version: data.version, nombre_version },
  });

  return NextResponse.json({ data });
}
