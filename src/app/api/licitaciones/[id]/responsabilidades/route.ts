import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { AsignacionResponsabilidad, FuncionProcedimiento } from "@/types";

const FUNCIONES: FuncionProcedimiento[] = [
  "COORDINADOR",
  "JURIDICO",
  "TECNICO",
  "COMERCIAL",
  "FINANZAS",
  "DIRECCION",
  "OPERADOR_COMPRAS_MX",
  "REVISOR",
];

function buildAsignaciones(
  existentes: AsignacionResponsabilidad[] = [],
): AsignacionResponsabilidad[] {
  const previas = new Map(existentes.map((a) => [a.funcion, a.usuario_id]));
  return FUNCIONES.map((funcion) => ({ funcion, usuario_id: previas.get(funcion) ?? null }));
}

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

  const { data: existente } = await supabase
    .from("responsabilidades_procedimiento")
    .select("asignaciones_json")
    .eq("licitacion_id", id)
    .maybeSingle();

  return NextResponse.json({
    data: { asignaciones_json: buildAsignaciones(existente?.asignaciones_json ?? []) },
  });
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

  const { asignaciones_json } = await request.json();
  const asignaciones = buildAsignaciones(asignaciones_json ?? []);

  const { data, error } = await supabase
    .from("responsabilidades_procedimiento")
    .upsert(
      { licitacion_id: id, asignaciones_json: asignaciones },
      { onConflict: "licitacion_id" },
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
