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

  const { data, error } = await supabase
    .from("referencias_legales")
    .select("id, nombre, nombre_completo, tipo, ambito, descripcion, url_oficial, orden")
    .order("orden");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: documentos } = await supabase
    .from("referencia_legal_documentos")
    .select("referencia_legal_id, procesado");

  const conContenido = new Set(
    (documentos ?? []).filter((d) => d.procesado).map((d) => d.referencia_legal_id),
  );

  return NextResponse.json({
    data: (data ?? []).map((r) => ({ ...r, con_contenido: conContenido.has(r.id) })),
  });
}
