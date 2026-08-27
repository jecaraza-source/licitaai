import { z } from "zod";
import { apiRoute, ApiError, requireWriteRole } from "@/lib/api";
import { encolarOperacionIA } from "@/lib/jobs";

const paramsSchema = z.object({
  id: z.string().uuid("id debe ser un UUID válido"),
  docId: z.string().uuid("docId debe ser un UUID válido"),
});
const bodySchema = z.object({
  fecha_emision_manual: z.string().trim().nullable().optional(),
});

export const POST = apiRoute(
  { paramsSchema, bodySchema },
  async ({ ctx, params, body }) => {
    requireWriteRole(ctx);

    // Antes, docId nunca se comparaba contra `id` (empresa_perfil) en la
    // URL antes de invocar el análisis — un docId de OTRO perfil de
    // empresa de la misma organización pasaba igual.
    const { data: doc } = await ctx.supabase
      .from("documentos_corporativos")
      .select("id")
      .eq("id", params.docId)
      .eq("empresa_perfil_id", params.id)
      .maybeSingle();
    if (!doc) throw ApiError.notFound("Documento no encontrado");

    const encolado = await encolarOperacionIA(ctx, {
      flag: "jobs.async_analizar_doc_corp",
      tipo: "analizar-documento-corporativo",
      recursoTipo: "documento_corporativo",
      recursoId: params.docId,
      input: { documento_id: params.docId, fecha_emision_manual: body.fecha_emision_manual ?? null },
    });
    if (encolado) return { data: encolado, status: 202 };

    const { data, error } = await ctx.supabase.functions.invoke("analizar-documento-corporativo", {
      body: { documento_id: params.docId, fecha_emision_manual: body.fecha_emision_manual ?? null },
    });

    if (error) throw ApiError.upstream();

    return { data: data?.data ?? null };
  },
);
