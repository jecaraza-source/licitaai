import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
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

  const { tipo, no_aplica } = await request.json();
  if (typeof tipo !== "string" || typeof no_aplica !== "boolean") {
    return NextResponse.json({ error: "tipo y no_aplica son requeridos" }, { status: 400 });
  }

  const { data: actual } = await supabase
    .from("licitaciones")
    .select("documentos_convocante_no_aplica")
    .eq("id", id)
    .single();

  const actuales = (actual?.documentos_convocante_no_aplica as string[] | null) ?? [];
  const siguientes = no_aplica
    ? [...new Set([...actuales, tipo])]
    : actuales.filter((t) => t !== tipo);

  const { data, error } = await supabase
    .from("licitaciones")
    .update({ documentos_convocante_no_aplica: siguientes })
    .eq("id", id)
    .select("documentos_convocante_no_aplica")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
