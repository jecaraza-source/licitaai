import { z } from "zod";
import { apiRoute, ApiError, requireWriteRole } from "@/lib/api";
import { isEnabled } from "@/lib/flags";
import { bucketIdempotencia, crearJobConPresupuesto } from "@/lib/jobs";

const paramsSchema = z.object({ id: z.string().uuid("id debe ser un UUID válido") });

export const POST = apiRoute(
  { paramsSchema, rateLimit: { ruta: "auditar-todos", max: 5 }, aiBudget: true },
  async ({ ctx, params }) => {
    requireWriteRole(ctx);

    const { data: todos } = await ctx.supabase
      .from("checklist_items")
      .select("id, documento_id, estado")
      .eq("licitacion_id", params.id)
      .not("documento_id", "is", null);

    // Los renglones GRIS ("No aplica") no se auditan: la auditoría no los
    // cambia de estado, así que solo gastaría IA sin efecto.
    const items = (todos ?? []).filter((i) => i.estado !== "GRIS");

    const asincrono = await isEnabled(ctx.supabase, "jobs.async_auditar_expediente", {
      organizationId: ctx.organizationId,
    });

    if (asincrono) {
      // B7 — en vez de N invocaciones síncronas en serie (que podían
      // rebasar cualquier timeout y disparar N llamadas de IA sin control),
      // se encolan N jobs auditar-documento (prioridad de lote) + 1 job
      // auditar-expediente. La concurrencia máxima por organización acota
      // el fan-out; cada job tiene su reserva de presupuesto.
      //
      // Las claves llevan bucket de tiempo: sin él, una segunda auditoría
      // (p. ej. tras reemplazar un documento) recibía de vuelta el job viejo
      // ya terminado y nunca re-auditaba.
      const bucket = bucketIdempotencia();
      const jobs: string[] = [];
      for (const item of items) {
        const { job } = await crearJobConPresupuesto(ctx, {
          tipo: "auditar-documento",
          recurso_tipo: "documento",
          recurso_id: item.documento_id as string,
          idempotency_key: `auditar-todos:${params.id}:${item.id}:${bucket}`,
          input: { documento_id: item.documento_id, checklist_item_id: item.id },
          prioridad: 200,
        });
        jobs.push(job.id);
      }
      const { job: expediente } = await crearJobConPresupuesto(ctx, {
        tipo: "auditar-expediente",
        recurso_tipo: "licitacion",
        recurso_id: params.id,
        idempotency_key: `auditar-todos:${params.id}:expediente:${bucket}`,
        input: { licitacion_id: params.id },
        prioridad: 200,
      });
      return { data: { jobs, expediente_job_id: expediente.id, async: true }, status: 202 };
    }

    // Se revisa el resultado de CADA auditoría: antes un fallo se tragaba en
    // silencio y el expediente se auditaba con datos a medias.
    const fallidos: string[] = [];
    for (const item of items) {
      const { error } = await ctx.supabase.functions.invoke("auditar-documento", {
        body: { documento_id: item.documento_id, checklist_item_id: item.id },
      });
      if (error) fallidos.push(item.id);
    }
    const auditados = items.length - fallidos.length;

    // Si no se pudo auditar ningún documento, no tiene sentido auditar el
    // expediente encima: se falla en vez de reportar éxito.
    if (items.length > 0 && auditados === 0) throw ApiError.upstream();

    const { data, error } = await ctx.supabase.functions.invoke("auditar-expediente", {
      body: { licitacion_id: params.id },
    });

    if (error) throw ApiError.upstream();

    return {
      data: {
        ...(data ?? {}),
        documentos: { auditados, fallidos: fallidos.length, fallidos_ids: fallidos },
      },
    };
  },
);
