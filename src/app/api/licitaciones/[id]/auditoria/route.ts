import { z } from "zod";
import { apiRoute, ApiError } from "@/lib/api";

const paramsSchema = z.object({ id: z.string().uuid("id debe ser un UUID válido") });

const CATEGORIAS = ["LEGAL", "FISCAL", "TECNICO", "ECONOMICO", "ESPECIFICO"] as const;

export const GET = apiRoute({ paramsSchema }, async ({ ctx, params }) => {
  const [{ data: checklist, error: checklistError }, { data: ultimoReporte, error: reporteError }] =
    await Promise.all([
      ctx.supabase
        .from("checklist_items")
        .select("*, documentos(id, nombre, auditoria_json), responsable:users(id, nombre)")
        .eq("licitacion_id", params.id)
        .order("categoria"),
      ctx.supabase
        .from("actividad_log")
        .select("metadata_json, created_at")
        .eq("licitacion_id", params.id)
        .eq("accion", "auditoria_expediente")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  if (checklistError || reporteError) throw ApiError.internal();

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

  return {
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
  };
});
