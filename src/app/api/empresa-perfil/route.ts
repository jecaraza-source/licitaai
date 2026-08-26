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
    .select("organization_id, empresa_perfil_id")
    .eq("id", user.id)
    .single();
  if (!perfil) {
    return NextResponse.json({ error: "Perfil no encontrado" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("empresa_perfil")
    .select("*")
    .eq("organization_id", perfil.organization_id)
    .order("updated_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, activaId: perfil.empresa_perfil_id });
}

export async function POST(request: Request) {
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
  const nueva = {
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
    color_primario: body.color_primario ?? null,
    color_secundario: body.color_secundario ?? null,
    objeto_social: body.objeto_social ?? null,
    acta_escritura_numero: body.acta_escritura_numero ?? null,
    acta_escritura_fecha: body.acta_escritura_fecha ?? null,
    acta_notario: body.acta_notario ?? null,
    acta_notaria_numero: body.acta_notaria_numero ?? null,
    acta_notaria_estado: body.acta_notaria_estado ?? null,
    acta_registro_publico: body.acta_registro_publico ?? null,
    representante_legal_nombre: body.representante_legal_nombre ?? null,
    representante_legal_escritura_numero: body.representante_legal_escritura_numero ?? null,
    representante_legal_escritura_fecha: body.representante_legal_escritura_fecha ?? null,
    representante_legal_notario: body.representante_legal_notario ?? null,
    representante_legal_notaria_numero: body.representante_legal_notaria_numero ?? null,
    representante_legal_notaria_estado: body.representante_legal_notaria_estado ?? null,
    representante_legal_registro_publico: body.representante_legal_registro_publico ?? null,
    domicilio_fiscal: body.domicilio_fiscal ?? null,
    domicilio_notificaciones: body.domicilio_notificaciones ?? null,
    correo_notificaciones: body.correo_notificaciones ?? null,
    nacionalidad: body.nacionalidad || "Mexicana",
    normas_oficiales_aplican: Boolean(body.normas_oficiales_aplican),
    normas_oficiales_detalle: body.normas_oficiales_detalle ?? null,
    cuenta_personal_discapacidad: Boolean(body.cuenta_personal_discapacidad),
    estratificacion_mipyme: body.estratificacion_mipyme ?? null,
    socios_accionistas_json: Array.isArray(body.socios_accionistas_json)
      ? body.socios_accionistas_json
      : [],
    garantia_tecnica_meses: body.garantia_tecnica_meses ?? null,
    garantia_tecnica_detalle: body.garantia_tecnica_detalle ?? null,
    soporte_tecnico_contacto: body.soporte_tecnico_contacto ?? null,
    tiempo_inicio_servicio_dias: body.tiempo_inicio_servicio_dias ?? null,
    personal_tecnico_json: Array.isArray(body.personal_tecnico_json) ? body.personal_tecnico_json : [],
    infraestructura_equipo_json: Array.isArray(body.infraestructura_equipo_json)
      ? body.infraestructura_equipo_json
      : [],
    licencias_permisos_json: Array.isArray(body.licencias_permisos_json)
      ? body.licencias_permisos_json
      : [],
  };

  const { data, error } = await supabase.from("empresa_perfil").insert(nueva).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("users").update({ empresa_perfil_id: data.id }).eq("id", user.id);

  return NextResponse.json({ data });
}
