import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { licitacionSchema } from "@/lib/validations/licitacion";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? "20")));
  const estado_licitacion = searchParams.get("estado_licitacion");
  const tipo = searchParams.get("tipo");
  const estado_id = searchParams.get("estado_id");
  const search = searchParams.get("search")?.trim();

  let query = supabase
    .from("licitaciones")
    .select("*, analisis_bases(objeto_contrato)", { count: "exact" })
    .order("created_at", { ascending: false });

  if (estado_licitacion) query = query.eq("estado_licitacion", estado_licitacion);
  if (tipo) query = query.eq("tipo", tipo);
  if (estado_id) query = query.eq("estado_id", estado_id);
  if (search) {
    query = query.or(
      `numero_expediente.ilike.%${search}%,titulo.ilike.%${search}%,institucion.ilike.%${search}%`,
    );
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, error, count } = await query.range(from, to);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data, count, page, pageSize });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { data: perfil } = await supabase
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  if (!perfil) {
    return NextResponse.json({ error: "Perfil no encontrado" }, { status: 403 });
  }

  const json = await request.json();
  const parsed = licitacionSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("licitaciones")
    .insert({
      ...parsed.data,
      organization_id: perfil.organization_id,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: plantillas } = await supabase
    .from("checklist_templates")
    .select("categoria, descripcion, fundamento_legal, vigencia_requerida, formato_aceptado, requerido")
    .eq("estado_id", data.estado_id);

  if (plantillas && plantillas.length > 0) {
    await supabase.from("checklist_items").insert(
      plantillas.map((p) => ({ ...p, licitacion_id: data.id })),
    );
  }

  await supabase.from("actividad_log").insert({
    licitacion_id: data.id,
    user_id: user.id,
    accion: "creacion",
    metadata_json: { titulo: data.titulo },
  });

  return NextResponse.json({ data }, { status: 201 });
}
