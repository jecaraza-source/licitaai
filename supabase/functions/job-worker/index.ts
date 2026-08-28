// P2 · A2 — worker de jobs asíncronos (ADR 0001, ADR 0002).
//
// Disparado por pg_cron cada ~10s + Vercel Cron cada 1 min (respaldo) +
// Database Webhook en insert (arranque inmediato) — ver incremento A3.
//
// Cada invocación:
//   1. barre jobs expirados / zombies (expirar_jobs)
//   2. reclama hasta JOB_WORKER_BATCH jobs (FOR UPDATE SKIP LOCKED)
//   3. ejecuta UN step de cada uno (ejecutarUnJob)
//   4. repite hasta agotar la cola o el presupuesto de tiempo del tick
//
// No confía en el JWT de un usuario: lo invoca un disparador interno con un
// secreto (worker-auth.ts). Corre con service_role.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { estaAutorizadoWorker } from "../_shared/worker-auth.ts";
import { ejecutarUnJob, type JobRow, type ResultadoEjecucion } from "../_shared/job-runner.ts";
import { notificarJobSiCorresponde } from "../_shared/job-notify.ts";

const LIMITE_POR_TICK = Number(Deno.env.get("JOB_WORKER_BATCH") ?? "5");
const PRESUPUESTO_TICK_MS = Number(Deno.env.get("JOB_WORKER_TICK_BUDGET_MS") ?? "50000");

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (!estaAutorizadoWorker(req.headers.get("Authorization"))) {
    return json({ error: "No autorizado" }, 401);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    return json({ error: "Configuración incompleta" }, 500);
  }
  const service = createClient(url, serviceKey, { auth: { persistSession: false } });

  const workerId = `w-${crypto.randomUUID().slice(0, 8)}`;
  const deadline = Date.now() + PRESUPUESTO_TICK_MS;
  const resumen: Record<ResultadoEjecucion | "reclamados", number> = {
    reclamados: 0,
    COMPLETED: 0,
    REQUEUED: 0,
    CANCELLED: 0,
    RETRYING_OR_FAILED: 0,
    SKIPPED: 0,
  };

  const { data: expirados } = await service.rpc("expirar_jobs");
  if (typeof expirados === "number" && expirados > 0) {
    console.log(`[job-worker] ${expirados} jobs expirados`);
  }

  // Notificar jobs recién expirados (expirar_jobs no envía correo).
  const { data: expiradosSinNotificar } = await service
    .from("jobs")
    .select("id, tipo, estado, requested_by, created_at, finished_at, error_seguro")
    .eq("estado", "EXPIRED")
    .is("notificado_at", null)
    .gte("finished_at", new Date(Date.now() - 3_600_000).toISOString())
    .limit(20);
  for (const j of expiradosSinNotificar ?? []) {
    await notificarJobSiCorresponde(service, j);
  }

  while (Date.now() < deadline) {
    const { data: jobs, error } = await service.rpc("reclamar_jobs", {
      p_worker_id: workerId,
      p_limite: LIMITE_POR_TICK,
    });
    if (error) {
      console.error("[job-worker] reclamar_jobs falló:", error.message);
      return json({ error: "reclamar_jobs falló", detalle: error.message }, 500);
    }
    if (!jobs || jobs.length === 0) break;

    for (const job of jobs as JobRow[]) {
      resumen.reclamados++;
      try {
        const { resultado } = await ejecutarUnJob(service, job);
        resumen[resultado]++;
      } catch (e) {
        console.error(`[job-worker] error no controlado en job ${job.id}:`, e);
        resumen.RETRYING_OR_FAILED++;
      }
      if (Date.now() >= deadline) break;
    }
  }

  return json({ ok: true, worker_id: workerId, resumen });
});
