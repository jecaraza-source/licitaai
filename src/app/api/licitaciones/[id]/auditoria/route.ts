import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const CATEGORIAS = ["LEGAL", "FISCAL", "TECNICO", "ECONOMICO", "ESPECIFICO"] as const;

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

  const [{ data: checklist }, { data: ultimoReporte }] = await Promise.all([
    supabase
      .from("checklist_items")
      .select("*, documentos(id, nombre, auditoria_json), responsable:users(id, nombre)")
      .eq("licitacion_id", id)
      .order("categoria"),
    supabase
      .from("actividad_log")
      .select("metadata_json, created_at")
      .eq("licitacion_id", id)
      .eq("accion", "auditoria_expediente")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const items = checklist ?? [];

  const porCategoria: Record<string, { total: number; completos: number; pct: number }> = {};
  for (const cat of CATEGORIAS) {
    const delCategoria = items.filter((i) => i.categoria === cat && i.requerido);
    const completos = delCategoria.filter((i) => i.estado === "VERDE" || i.estado === "GRIS");
    porCategoria[cat] = {
      total: delCategoria.length,
      completos: completos.length,
      pct: delCategoria.length > 0 ? Math.round((completos.length / delCategoria.length) * 100) : 100,
    };
  }

  const requeridos = items.filter((i) => i.requerido);
  const totalCompletos = requeridos.filter((i) => i.estado === "VERDE" || i.estado === "GRIS");
  const score = requeridos.length > 0 ? Math.round((totalCompletos.length / requeridos.length) * 100) : 0;

  const rojos = items.filter((i) => i.estado === "ROJO");
  const amarillosCriticos = items.filter((i) => i.estado === "AMARILLO" && i.critico);

  return NextResponse.json({
    data: {
      score,
      porCategoria,
      checklist: items,
      ultimoReporte: ultimoReporte?.metadata_json ?? null,
      gate: {
        rojos: rojos.length,
        amarillosCriticos: amarillosCriticos.length,
        bloqueado: rojos.length > 0 || amarillosCriticos.length > 0,
      },
    },
  });
}
