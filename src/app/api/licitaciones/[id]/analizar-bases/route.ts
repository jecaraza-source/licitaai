import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
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

  const { data: licitacion } = await supabase
    .from("licitaciones")
    .select("id")
    .eq("id", id)
    .single();

  if (!licitacion) {
    return NextResponse.json({ error: "Licitación no encontrada" }, { status: 404 });
  }

  const { data, error } = await supabase.functions.invoke("analizar-bases", {
    body: { licitacion_id: id },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
