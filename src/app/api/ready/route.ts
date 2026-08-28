import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// P2 · E4 — readiness. Comprueba las dependencias críticas: PostgreSQL,
// Storage y el estado de los circuit breakers de los proveedores. 200 si
// todo sano, 503 si algo falla. Sin auth (es un endpoint de plataforma),
// pero no expone datos: solo ok/degradado por dependencia.
export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ status: "error", detalle: "configuración incompleta" }, { status: 503 });
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const checks: Record<string, "ok" | "fail" | "degradado"> = {};

  // PostgreSQL
  try {
    const { error } = await supabase.from("organizations").select("id", { head: true, count: "exact" }).limit(1);
    checks.postgres = error ? "fail" : "ok";
  } catch {
    checks.postgres = "fail";
  }

  // Storage
  try {
    const { error } = await supabase.storage.from("documentos-originales").list("", { limit: 1 });
    checks.storage = error ? "fail" : "ok";
  } catch {
    checks.storage = "fail";
  }

  // Circuit breakers — abierto = degradado (no impide readiness "hard",
  // pero se reporta).
  try {
    const { data } = await supabase.from("provider_health").select("provider, estado");
    for (const row of (data ?? []) as Array<{ provider: string; estado: string }>) {
      checks[`cb_${row.provider}`] = row.estado === "OPEN" ? "degradado" : "ok";
    }
  } catch {
    /* no crítico */
  }

  const hardFail = Object.entries(checks).some(([k, v]) => v === "fail" && (k === "postgres" || k === "storage"));
  const degradado = Object.values(checks).includes("degradado");

  return NextResponse.json(
    { status: hardFail ? "error" : degradado ? "degradado" : "ok", checks, ts: new Date().toISOString() },
    { status: hardFail ? 503 : 200 },
  );
}
