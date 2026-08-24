import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ESTADOS = ["VERDE", "AMARILLO", "ROJO", "GRIS"] as const;
const TIPOS_FORMATO = ["A", "B", "C", "D"] as const;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const { itemId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = await request.json();
  const update: Record<string, unknown> = {};
  if (typeof body.estado === "string" && ESTADOS.includes(body.estado)) update.estado = body.estado;
  if (typeof body.documento_id === "string" || body.documento_id === null) {
    update.documento_id = body.documento_id;
  }
  if (typeof body.critico === "boolean") update.critico = body.critico;
  if (typeof body.fuente === "string" || body.fuente === null) update.fuente = body.fuente;
  if (typeof body.responsable_id === "string" || body.responsable_id === null) {
    update.responsable_id = body.responsable_id;
  }
  if (typeof body.fecha_limite === "string" || body.fecha_limite === null) {
    update.fecha_limite = body.fecha_limite;
  }
  if (typeof body.causa_desechamiento === "string" || body.causa_desechamiento === null) {
    update.causa_desechamiento = body.causa_desechamiento;
  }
  if (typeof body.observaciones === "string" || body.observaciones === null) {
    update.observaciones = body.observaciones;
  }
  if (body.tipo_formato === null || TIPOS_FORMATO.includes(body.tipo_formato)) {
    update.tipo_formato = body.tipo_formato;
  }

  const { data, error } = await supabase
    .from("checklist_items")
    .update(update)
    .eq("id", itemId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
