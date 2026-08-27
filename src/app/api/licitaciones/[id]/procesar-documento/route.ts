import { z } from "zod";
import { apiRoute, ApiError, requireWriteRole } from "@/lib/api";
import { isEnabled } from "@/lib/flags";
import { crearJob } from "@/lib/jobs";

const paramsSchema = z.object({ id: z.string().uuid("id debe ser un UUID válido") });
const bodySchema = z.object({
  documento_id: z.string().uuid("documento_id debe ser un UUID válido"),
});

// P2 · B1 — procesar-documento vía sistema de jobs cuando el flag
// `jobs.async_procesar_documento` está activo para la organización. Con el
// flag apagado, comportamiento idéntico al anterior (invoca la Edge
// Function síncrona). Los 3 call sites del frontend son fire-and-forget y
// dependen del Realtime de `documentos` (procesado -> toast), que el step
// "finalizar" del job sigue disparando — no requieren cambios.
export const POST = apiRoute(
  { paramsSchema, bodySchema, rateLimit: { ruta: "procesar-documento", max: 20 }, aiBudget: true },
  async ({ ctx, params, body }) => {
    requireWriteRole(ctx);

    const { data: documento } = await ctx.supabase
      .from("documentos")
      .select("id, licitacion_id")
      .eq("id", body.documento_id)
      .eq("licitacion_id", params.id)
      .maybeSingle();

    if (!documento) throw ApiError.notFound("Documento no encontrado");

    const asincrono = await isEnabled(ctx.supabase, "jobs.async_procesar_documento", {
      organizationId: ctx.organizationId,
    });

    if (asincrono) {
      const { job } = await crearJob(ctx, {
        tipo: "procesar-documento",
        recurso_tipo: "documento",
        recurso_id: body.documento_id,
        idempotency_key: `procdoc:${body.documento_id}`,
        input: { documento_id: body.documento_id },
      });
      return { data: { job_id: job.id, estado: job.estado, async: true }, status: 202 };
    }

    const { data, error } = await ctx.supabase.functions.invoke("procesar-documento", {
      body: { documento_id: body.documento_id },
    });
    if (error) throw ApiError.upstream();
    return { data };
  },
);
