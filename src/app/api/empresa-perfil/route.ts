import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
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

  const { data, error } = await supabase
    .from("empresa_perfil")
    .select("*")
    .eq("organization_id", perfil.organization_id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function PUT(request: Request) {
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

  const body = await request.json();
  const update = {
    organization_id: perfil.organization_id,
    razon_social: body.razon_social ?? null,
    rfc: body.rfc ?? null,
    giro: body.giro ?? null,
    experiencia_anos: body.experiencia_anos ?? null,
    certificaciones_json: Array.isArray(body.certificaciones_json) ? body.certificaciones_json : [],
    clientes_referencia_json: Array.isArray(body.clientes_referencia_json)
      ? body.clientes_referencia_json
      : [],
    logo_url: body.logo_url ?? null,
  };

  const { data, error } = await supabase
    .from("empresa_perfil")
    .upsert(update, { onConflict: "organization_id" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
