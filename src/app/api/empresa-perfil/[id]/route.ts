import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { data, error } = await supabase.from("empresa_perfil").select().eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { tipo, no_aplica } = await request.json();
  if (typeof tipo !== "string" || typeof no_aplica !== "boolean") {
    return NextResponse.json({ error: "tipo y no_aplica son requeridos" }, { status: 400 });
  }

  const { data: actual } = await supabase
    .from("empresa_perfil")
    .select("documentos_no_aplican")
    .eq("id", id)
    .single();

  const actuales = (actual?.documentos_no_aplican as string[] | null) ?? [];
  const siguientes = no_aplica
    ? [...new Set([...actuales, tipo])]
    : actuales.filter((t) => t !== tipo);

  const { data, error } = await supabase
    .from("empresa_perfil")
    .update({ documentos_no_aplican: siguientes })
    .eq("id", id)
    .select("documentos_no_aplican")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = await request.json();
  const update = {
    razon_social: body.razon_social ?? null,
    rfc: body.rfc ?? null,
    giro: body.giro ?? null,
    experiencia_anos: body.experiencia_anos ?? null,
    certificaciones_json: Array.isArray(body.certificaciones_json) ? body.certificaciones_json : [],
    clientes_referencia_json: Array.isArray(body.clientes_referencia_json)
      ? body.clientes_referencia_json
      : [],
    logo_url: body.logo_url ?? null,
    color_primario: body.color_primario ?? null,
    color_secundario: body.color_secundario ?? null,
  };

  const { data, error } = await supabase
    .from("empresa_perfil")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
