import { z } from "zod";
import { apiRoute, ApiError } from "@/lib/api";
import { aiResultIdParamsSchema, AI_RESULT_COLUMNS } from "@/lib/validations/ai-results";
import { diffJson, resumenDiff, type NodoDiff } from "@/lib/json-diff";

interface RespuestaDiff {
  actual: AiResultFila;
  anterior: AiResultFila | null;
  diff: NodoDiff | null;
  resumen: { agregados: number; eliminados: number; modificados: number } | null;
  nota?: string;
}

// P2 punch-list B6 — comparación de dos versiones de un resultado de IA.
// Por defecto compara la versión `:id` con la que reemplaza (`reemplaza_a`);
// `?contra=<otro_id>` permite comparar contra cualquier otra versión del
// mismo grupo (recurso + tipo_analisis). RLS ya limita a la organización.
const querySchema = z.object({
  contra: z.string().uuid().optional(),
});

// El cliente Supabase no está tipado con Database (P1.4 R1) y
// `.select(<string variable>)` degrada a GenericStringError — se castea
// en la frontera, igual que en licitaciones/[id]/ai-results/route.ts.
type AiResultFila = Record<string, unknown> & {
  reemplaza_a: string | null;
  recurso_tipo: string;
  recurso_id: string;
  tipo_analisis: string;
  resultado_json: unknown;
};

export const GET = apiRoute(
  { paramsSchema: aiResultIdParamsSchema, querySchema },
  async ({ ctx, params, query }) => {
    const { data: actualRaw, error } = await ctx.supabase
      .from("ai_results")
      .select(AI_RESULT_COLUMNS)
      .eq("id", params.id)
      .maybeSingle();
    if (error) throw ApiError.internal();
    if (!actualRaw) throw ApiError.notFound("Resultado no encontrado");
    const actual = actualRaw as unknown as AiResultFila;

    const idAnterior = query.contra ?? actual.reemplaza_a;
    if (!idAnterior) {
      const r: RespuestaDiff = {
        actual,
        anterior: null,
        diff: null,
        resumen: null,
        nota: "Esta es la primera versión — no hay nada con qué compararla.",
      };
      return { data: r };
    }

    const { data: anteriorRaw } = await ctx.supabase
      .from("ai_results")
      .select(AI_RESULT_COLUMNS)
      .eq("id", idAnterior)
      // Mismo recurso y tipo — no se compara peras con manzanas.
      .eq("recurso_tipo", actual.recurso_tipo)
      .eq("recurso_id", actual.recurso_id)
      .eq("tipo_analisis", actual.tipo_analisis)
      .maybeSingle();

    if (!anteriorRaw) {
      throw ApiError.notFound("La versión a comparar no existe o no es del mismo análisis");
    }
    const anterior = anteriorRaw as unknown as AiResultFila;

    const diff = diffJson(anterior.resultado_json, actual.resultado_json);

    const r: RespuestaDiff = { actual, anterior, diff, resumen: resumenDiff(diff) };
    return { data: r };
  },
);
