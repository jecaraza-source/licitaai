import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import * as Sentry from "@sentry/nextjs";
import { estaAutorizadoCron } from "@/lib/cron-auth";

// P2 · E5 — monitoreo sintético. Ejecutado por Vercel Cron (ver vercel.json).
// Revisa señales de salud del sistema de jobs y de los proveedores; si algo
// está degradado, lo reporta a Sentry con nivel warning/error. No falla el
// endpoint por degradación (200 con el detalle) — un 5xx solo si el propio
// chequeo no pudo correr.
export const dynamic = "force-dynamic";

const UMBRAL_DLQ = 20;
const UMBRAL_FALLOS_PCT = 20; // % de jobs FAILED en la última hora

export async function GET(request: NextRequest) {
  if (!estaAutorizadoCron(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "Configuración incompleta" }, { status: 500 });
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const desde = new Date(Date.now() - 3_600_000).toISOString();
  const alertas: string[] = [];

  // 1. Dead letter creciendo.
  const { count: dlq } = await supabase
    .from("jobs_dead_letter")
    .select("id", { count: "exact", head: true })
    .gte("created_at", desde);
  if ((dlq ?? 0) >= UMBRAL_DLQ) alertas.push(`dead_letter: ${dlq} en la última hora`);

  // 2. Tasa de fallo de jobs en la última hora.
  const { data: recientes } = await supabase
    .from("jobs")
    .select("estado")
    .gte("finished_at", desde)
    .in("estado", ["COMPLETED", "FAILED"]);
  const total = recientes?.length ?? 0;
  const fallidos = (recientes ?? []).filter((j) => j.estado === "FAILED").length;
  const pctFallo = total > 0 ? Math.round((fallidos / total) * 100) : 0;
  if (total >= 10 && pctFallo >= UMBRAL_FALLOS_PCT) {
    alertas.push(`jobs fallidos: ${pctFallo}% (${fallidos}/${total}) en la última hora`);
  }

  // 3. Jobs atascados: AUTHORIZED viejos sin arrancar (worker caído).
  const { count: atascados } = await supabase
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .eq("estado", "AUTHORIZED")
    .lt("created_at", new Date(Date.now() - 300_000).toISOString());
  if ((atascados ?? 0) > 0) alertas.push(`jobs sin arrancar > 5 min: ${atascados}`);

  // 4. Circuit breakers abiertos.
  const { data: cbs } = await supabase.from("provider_health").select("provider, estado");
  const abiertos = (cbs ?? []).filter((c) => c.estado === "OPEN").map((c) => c.provider);
  if (abiertos.length > 0) alertas.push(`circuit breaker abierto: ${abiertos.join(", ")}`);

  const resumen = { dlq: dlq ?? 0, jobs_total_1h: total, jobs_fallo_pct: pctFallo, atascados: atascados ?? 0, cb_abiertos: abiertos };

  if (alertas.length > 0) {
    Sentry.captureMessage(`[monitoreo] ${alertas.join(" · ")}`, {
      level: alertas.some((a) => a.includes("sin arrancar") || a.includes("breaker")) ? "error" : "warning",
      extra: resumen,
    });
    console.warn("[monitoreo]", JSON.stringify({ alertas, resumen }));
  }

  return NextResponse.json({ ok: true, degradado: alertas.length > 0, alertas, resumen });
}
