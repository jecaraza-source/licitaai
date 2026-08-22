import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  const [{ data: partidas, error: partidasError }, { data: estudios, error: estudiosError }] =
    await Promise.all([
      supabase.from("partidas").select("*").eq("licitacion_id", id).order("numero"),
      supabase.from("estudio_mercado").select("*").eq("licitacion_id", id),
    ]);

  if (partidasError) return NextResponse.json({ error: partidasError.message }, { status: 500 });
  if (estudiosError) return NextResponse.json({ error: estudiosError.message }, { status: 500 });

  const estudiosPorPartida = new Map((estudios ?? []).map((e) => [e.partida_id, e]));
  const data = (partidas ?? []).map((p) => ({
    ...p,
    estudio_mercado: estudiosPorPartida.get(p.id) ?? null,
  }));

  return NextResponse.json({ data });
}
