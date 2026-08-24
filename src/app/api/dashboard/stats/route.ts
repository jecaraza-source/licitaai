import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { DashboardStats, EstadoLicitacion } from "@/types";

const ESTADOS: EstadoLicitacion[] = [
  "NUEVA",
  "ANALISIS",
  "PREPARACION",
  "ENVIADA",
  "SEGUIMIENTO",
  "CERRADA",
];

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [totalActivas, proximasAVencer, enPreparacion, enviadasLog, todasLasLicitaciones] =
    await Promise.all([
      supabase
        .from("licitaciones")
        .select("id", { count: "exact", head: true })
        .neq("estado_licitacion", "CERRADA"),
      supabase
        .from("licitaciones")
        .select("id", { count: "exact", head: true })
        .not("estado_licitacion", "in", "(ENVIADA,CERRADA)")
        .gte("fecha_entrega_propuesta", now.toISOString())
        .lte("fecha_entrega_propuesta", in7Days.toISOString()),
      supabase
        .from("licitaciones")
        .select("id", { count: "exact", head: true })
        .eq("estado_licitacion", "PREPARACION"),
      supabase
        .from("actividad_log")
        .select("licitacion_id")
        .eq("accion", "cambio_estado")
        .eq("metadata_json->>nuevo_estado", "ENVIADA")
        .gte("created_at", monthStart.toISOString()),
      supabase.from("licitaciones").select("estado_licitacion"),
    ]);

  const enviadasEsteMes = new Set((enviadasLog.data ?? []).map((r) => r.licitacion_id)).size;

  const porEstado = Object.fromEntries(ESTADOS.map((e) => [e, 0])) as Record<
    EstadoLicitacion,
    number
  >;
  for (const row of todasLasLicitaciones.data ?? []) {
    porEstado[row.estado_licitacion as EstadoLicitacion]++;
  }

  const stats: DashboardStats = {
    totalActivas: totalActivas.count ?? 0,
    proximasAVencer: proximasAVencer.count ?? 0,
    enPreparacion: enPreparacion.count ?? 0,
    enviadasEsteMes,
    porEstado,
  };

  return NextResponse.json({ data: stats });
}
