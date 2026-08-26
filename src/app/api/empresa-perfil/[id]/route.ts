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

  const { data, error } = await supabase
    .from("empresa_perfil")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
