import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import * as Sentry from "@sentry/nextjs";
import { estaAutorizadoCron } from "@/lib/cron-auth";
import { isEnabled } from "@/lib/flags";

// P2 · H2 — limpieza de datos por política de retención (P2.6, ADR 0010).
// Ejecutado por Vercel Cron (ver vercel.json, diario). Doble salvaguarda:
//
//   1. Flag `retencion.limpieza_automatica` (OFF) — si está apagado, la
//      ruta corre en modo observación: fuerza dry-run global, solo reporta.
//   2. Cada fila de data_retention_policy tiene su propio `dry_run`; el flag
//      encendido NO la pone en real, eso es un UPDATE humano por recurso.
//
// Nunca falla el endpoint por un error de un recurso: 200 con el detalle.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!estaAutorizadoCron(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Configuración incompleta" }, { status: 500 });

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  // Flag apagado -> modo observación (fuerza dry-run global).
  const automatico = await isEnabled(supabase, "retencion.limpieza_automatica");
  const forzarDryRun = automatico ? null : true;

  const { data, error } = await supabase.rpc("ejecutar_limpieza_retencion", {
    p_forzar_dry_run: forzarDryRun,
  });
  if (error) {
    Sentry.captureException(error, { tags: { cron: "retencion" } });
    return NextResponse.json({ error: "limpieza no ejecutada" }, { status: 500 });
  }

  const recursos = (data?.recursos ?? []) as Array<{
    recurso: string; dry_run: boolean; candidatas: number; borradas: number; error: string | null;
  }>;
  const conError = recursos.filter((r) => r.error);
  const borradasReales = recursos.reduce((n, r) => n + (r.dry_run ? 0 : r.borradas), 0);

  if (conError.length > 0) {
    Sentry.captureMessage(
      `[retencion] ${conError.length} recurso(s) con error: ${conError.map((r) => r.recurso).join(", ")}`,
      { level: "error", extra: { data } },
    );
  }
  console.log("[retencion]", JSON.stringify({
    automatico, forzarDryRun, borradasReales,
    resumen: recursos.map((r) => `${r.recurso}:${r.dry_run ? "dry" : "real"}:${r.candidatas}`),
  }));

  return NextResponse.json({ ok: true, automatico, borradas_reales: borradasReales, detalle: data });
}
