import { z } from "zod";
import { apiRoute, ApiError, requireWriteRole } from "@/lib/api";
import type { AsignacionResponsabilidad, FuncionProcedimiento } from "@/types";

const FUNCIONES: FuncionProcedimiento[] = [
  "COORDINADOR",
  "JURIDICO",
  "TECNICO",
  "COMERCIAL",
  "FINANZAS",
  "DIRECCION",
  "OPERADOR_COMPRAS_MX",
  "REVISOR",
];

const paramsSchema = z.object({ id: z.string().uuid("id debe ser un UUID válido") });
// Antes, asignaciones_json se pasaba directo a buildAsignaciones() sin
// verificar que fuera un array — un valor no-array (objeto, string) hacía
// que `.map()` dentro de buildAsignaciones lanzara un TypeError no
// controlado (500 genérico de Next en vez de un 400 claro).
const putBodySchema = z.object({
  asignaciones_json: z
    .array(
      z.object({
        funcion: z.enum(FUNCIONES as [FuncionProcedimiento, ...FuncionProcedimiento[]]),
        usuario_id: z.string().uuid().nullable(),
      }),
    )
    .optional()
    .default([]),
});

function buildAsignaciones(
  existentes: AsignacionResponsabilidad[] = [],
): AsignacionResponsabilidad[] {
  const previas = new Map(existentes.map((a) => [a.funcion, a.usuario_id]));
  return FUNCIONES.map((funcion) => ({ funcion, usuario_id: previas.get(funcion) ?? null }));
}

export const GET = apiRoute({ paramsSchema }, async ({ ctx, params }) => {
  const { data: existente, error } = await ctx.supabase
    .from("responsabilidades_procedimiento")
    .select("asignaciones_json")
    .eq("licitacion_id", params.id)
    .maybeSingle();

  if (error) throw ApiError.internal();

  return { data: { asignaciones_json: buildAsignaciones(existente?.asignaciones_json ?? []) } };
});

export const PUT = apiRoute({ paramsSchema, bodySchema: putBodySchema }, async ({ ctx, params, body }) => {
  requireWriteRole(ctx);

  const asignaciones = buildAsignaciones(body.asignaciones_json);

  const { data, error } = await ctx.supabase
    .from("responsabilidades_procedimiento")
    .upsert({ licitacion_id: params.id, asignaciones_json: asignaciones }, { onConflict: "licitacion_id" })
    .select()
    .single();

  if (error) throw ApiError.internal();
  return { data };
});
