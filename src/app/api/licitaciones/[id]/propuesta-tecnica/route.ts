import { z } from "zod";
import { apiRoute, ApiError, requireWriteRole } from "@/lib/api";
import { sanitizarHtml } from "@/lib/sanitize-html";

const paramsSchema = z.object({ id: z.string().uuid("id debe ser un UUID válido") });
const putBodySchema = z.object({
  contenido_json: z.record(z.string(), z.unknown()),
});

/** P1.6 — sanea por allowlist cualquier campo `html` (a cualquier
 * profundidad) dentro del contenido de la propuesta antes de persistirlo. */
function sanearHtmlProfundo(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(sanearHtmlProfundo);
  if (valor && typeof valor === "object") {
    return Object.fromEntries(
      Object.entries(valor as Record<string, unknown>).map(([k, v]) => [
        k,
        k === "html" && typeof v === "string" ? sanitizarHtml(v) : sanearHtmlProfundo(v),
      ]),
    );
  }
  return valor;
}

export const GET = apiRoute({ paramsSchema }, async ({ ctx, params }) => {
  const { data, error } = await ctx.supabase
    .from("propuestas")
    .select("*")
    .eq("licitacion_id", params.id)
    .eq("tipo", "TECNICA")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw ApiError.internal();
  return { data };
});

export const PUT = apiRoute({ paramsSchema, bodySchema: putBodySchema }, async ({ ctx, params, body }) => {
  requireWriteRole(ctx);

  const { data: actual } = await ctx.supabase
    .from("propuestas")
    .select("id")
    .eq("licitacion_id", params.id)
    .eq("tipo", "TECNICA")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!actual) throw ApiError.notFound("No hay propuesta técnica generada");

  const { data, error } = await ctx.supabase
    .from("propuestas")
    .update({ contenido_json: sanearHtmlProfundo(body.contenido_json) })
    .eq("id", actual.id)
    .select()
    .single();

  if (error) throw ApiError.internal();
  return { data };
});
