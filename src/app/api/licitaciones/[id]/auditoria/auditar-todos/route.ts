import { z } from "zod";
import { apiRoute, ApiError, requireWriteRole } from "@/lib/api";
import { isEnabled } from "@/lib/flags";
import { crearJobConPresupuesto } from "@/lib/jobs";

const paramsSchema = z.object({ id: z.string().uuid("id debe ser un UUID válido") });

export const POST = apiRoute(
  { paramsSchema, rateLimit: { ruta: "auditar-todos", max: 5 }, aiBudget: true },
  async ({ ctx, params }) => {
    requireWriteRole(ctx);

    const { data: items } = await ctx.supabase
      .from("checklist_items")
      .select("id, documento_id")
      .eq("licitacion_id", params.id)
      .not("documento_id", "is", null);

    const asincrono = await isEnabled(ctx.supabase, "jobs.async_auditar_expediente", {
      organizationId: ctx.organizationId,
    });

    if (asincrono) {
      // B7 — en vez de N invocaciones síncronas en serie (que podían
      // rebasar cualquier timeout y disparar N llamadas de IA sin control),
      // se encolan N jobs auditar-documento (prioridad de lote) + 1 job
      // auditar-expediente. La concurrencia máxima por organización acota
      // el fan-out; cada job tiene su reserva de presupuesto.
      const jobs: string[] = [];
      for (const item of items ?? []) {
        const { job } = await crearJobConPresupuesto(ctx, {
          tipo: "auditar-documento",
          recurso_tipo: "documento",
          recurso_id: item.documento_id as string,
          idempotency_key: `auditar-todos:${params.id}:${item.id}`,
          input: { documento_id: item.documento_id, checklist_item_id: item.id },
          prioridad: 200,
        });
        jobs.push(job.id);
      }
      const { job: expediente } = await crearJobConPresupuesto(ctx, {
        tipo: "auditar-expediente",
        recurso_tipo: "licitacion",
        recurso_id: params.id,
        idempotency_key: `auditar-todos:${params.id}:expediente`,
        input: { licitacion_id: params.id },
        prioridad: 200,
      });
      return { data: { jobs, expediente_job_id: expediente.id, async: true }, status: 202 };
    }

    for (const item of items ?? []) {
      await ctx.supabase.functions.invoke("auditar-documento", {
        body: { documento_id: item.documento_id, checklist_item_id: item.id },
      });
    }

    const { data, error } = await ctx.supabase.functions.invoke("auditar-expediente", {
      body: { licitacion_id: params.id },
    });

    if (error) throw ApiError.upstream();

    return { data };
  },
);
