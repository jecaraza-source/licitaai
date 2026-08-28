import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import * as Sentry from "@sentry/nextjs";
import { estaAutorizadoCron } from "@/lib/cron-auth";

// P2 · E5 + I — monitoreo sintético con clasificación de severidad.
// Ejecutado por Vercel Cron (ver vercel.json). Reporta a Sentry y, si
// ALERTAS_WEBHOOK_URL está configurada, a ese webhook (Slack/Teams). No
// falla el endpoint por degradación — 200 con el detalle.
export const dynamic = "force-dynamic";

type Sev = "SEV1" | "SEV2" | "SEV3";
interface Alerta { sev: Sev; msg: string }

export async function GET(request: NextRequest) {
  if (!estaAutorizadoCron(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Configuración incompleta" }, { status: 500 });

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data: m, error } = await supabase.rpc("metricas_operacion");
  if (error || !m) {
    Sentry.captureMessage("[monitoreo] no se pudieron obtener las métricas", { level: "error" });
    return NextResponse.json({ error: "métricas no disponibles" }, { status: 500 });
  }

  const alertas: Alerta[] = [];
  const j = m.jobs;
  const cb = m.circuit_breakers as Array<{ provider: string; estado: string }>;

  // SEV1 — el sistema no procesa jobs.
  if (j.atascados > 0 && j.ultimo_arranque_at &&
      Date.now() - new Date(j.ultimo_arranque_at).getTime() > 300_000) {
    alertas.push({ sev: "SEV1", msg: `${j.atascados} jobs sin arrancar y sin actividad del worker > 5 min` });
  }

  // SEV2 — degradación notable.
  const abiertos = cb.filter((c) => c.estado === "OPEN").map((c) => c.provider);
  if (abiertos.length > 0) alertas.push({ sev: "SEV2", msg: `circuit breaker abierto: ${abiertos.join(", ")}` });
  if (j.dead_letter.ultima_hora >= 20) alertas.push({ sev: "SEV2", msg: `dead letter: ${j.dead_letter.ultima_hora} en la última hora` });
  if (j.sin_intervencion_pct != null && j.ultimas_24h.total >= 20 && j.sin_intervencion_pct < 98) {
    alertas.push({ sev: "SEV2", msg: `jobs sin intervención ${j.sin_intervencion_pct}% (SLO ≥ 98%)` });
  }
  if (j.arranque_seg.p95 != null && j.arranque_seg.p95 > 10) {
    alertas.push({ sev: "SEV2", msg: `arranque de job p95 ${j.arranque_seg.p95}s (SLO < 10s)` });
  }
  if (m.consumo_ia.orgs_sobre_80pct > 0) {
    alertas.push({ sev: "SEV3", msg: `${m.consumo_ia.orgs_sobre_80pct} organización(es) sobre el 80% de su cuota mensual de IA` });
  }

  const peor = alertas.some((a) => a.sev === "SEV1") ? "SEV1"
    : alertas.some((a) => a.sev === "SEV2") ? "SEV2"
    : alertas.length > 0 ? "SEV3" : null;

  if (peor) {
    const texto = alertas.map((a) => `[${a.sev}] ${a.msg}`).join(" · ");
    Sentry.captureMessage(`[monitoreo] ${texto}`, {
      level: peor === "SEV1" ? "fatal" : peor === "SEV2" ? "error" : "warning",
      extra: { metricas: m },
    });
    console.warn("[monitoreo]", JSON.stringify({ peor, alertas }));

    const webhook = process.env.ALERTAS_WEBHOOK_URL;
    if (webhook) {
      await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: `⚠️ *${peor}* LicitaAI\n${texto}` }),
        signal: AbortSignal.timeout(5000),
      }).catch(() => {});
    }
  }

  return NextResponse.json({ ok: true, severidad: peor, alertas });
}
