import { z } from "zod";
import { apiRoute, ApiError } from "@/lib/api";
import { listarAiResultsQuerySchema, AI_RESULT_COLUMNS } from "@/lib/validations/ai-results";

const paramsSchema = z.object({ id: z.string().uuid("id debe ser un UUID válido") });

// P2 · D3 — historial de resultados de IA de una licitación (ADR 0006).
// Devuelve todas las versiones (append-only), la más reciente primero, con
// las citas de cada una y un marcador de cuál es la "activa" por
// (tipo_analisis, documento_id): la más reciente APROBADA, o la más
// reciente si ninguna lo está.
export const GET = apiRoute(
  { paramsSchema, querySchema: listarAiResultsQuerySchema },
  async ({ ctx, params, query }) => {
    const { data: licitacion } = await ctx.supabase
      .from("licitaciones")
      .select("id")
      .eq("id", params.id)
      .maybeSingle();
    if (!licitacion) throw ApiError.notFound("Licitación no encontrada");

    let q = ctx.supabase
      .from("ai_results")
      .select(`${AI_RESULT_COLUMNS}, ai_result_citations(document_chunk_id, documento_id, pagina, seccion, extracto, score)`)
      .eq("recurso_tipo", "licitacion")
      .eq("recurso_id", params.id)
      .order("created_at", { ascending: false });

    if (query.tipo_analisis) q = q.eq("tipo_analisis", query.tipo_analisis);
    if (query.documento_id) q = q.eq("documento_id", query.documento_id);

    const { data, error } = await q;
    if (error) throw ApiError.internal();

    const filas = (data ?? []) as Array<Record<string, unknown>>;

    // Marcar la versión activa por grupo (tipo_analisis + documento_id).
    const activos = new Set<string>();
    const vistos = new Set<string>();
    for (const modo of ["aprobado", "cualquiera"] as const) {
      for (const r of filas) {
        const clave = `${r.tipo_analisis}::${r.documento_id ?? ""}`;
        if (vistos.has(clave)) continue;
        if (modo === "aprobado" && r.estado_aprobacion !== "APROBADO") continue;
        activos.add(r.id as string);
        vistos.add(clave);
      }
    }

    return {
      data: {
        items: filas.map((r) => ({ ...r, activo: activos.has(r.id as string) })),
        total: filas.length,
      },
    };
  },
);
