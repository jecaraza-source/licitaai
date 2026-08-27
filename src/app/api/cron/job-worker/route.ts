import { NextResponse, type NextRequest } from "next/server";
import { estaAutorizadoCron } from "@/lib/cron-auth";

// P2 · A3 — disparador PRIMARIO del worker de jobs (ADR 0001).
//
// Ejecutado por Vercel Cron cada 1 min (ver vercel.json). Portable entre
// entornos: no necesita secretos del lado de Postgres, solo las env vars de
// Vercel. pg_cron cada 10s (migración 20260827003000) es una mejora
// opcional de latencia encima de esto, no un reemplazo.
//
// Reenvía a la Edge Function job-worker con el secreto del worker. El
// worker es idempotente y usa FOR UPDATE SKIP LOCKED, así que solaparse con
// otro disparador (pg_cron, webhook) no causa doble procesamiento.
export async function GET(request: NextRequest) {
  if (!estaAutorizadoCron(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const workerSecret =
    process.env.JOB_WORKER_SECRET ??
    process.env.CRON_SECRET ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !workerSecret) {
    return NextResponse.json({ error: "Configuración incompleta" }, { status: 500 });
  }

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/job-worker`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${workerSecret}`,
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? workerSecret,
      },
      // El worker acota su propio presupuesto de tiempo; damos margen.
      signal: AbortSignal.timeout(55_000),
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json({ ok: false, status: res.status, body }, { status: 502 });
    }
    return NextResponse.json({ ok: true, worker: body });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.name : "fallo al invocar el worker" },
      { status: 502 },
    );
  }
}
