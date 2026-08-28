import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// P2 · I6 — página de estado pública. Sin auth, sin datos sensibles: solo
// el estado operativo de los servicios de IA y una señal de salud de la
// plataforma.
export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ estado: "desconocido" }, { status: 200 });
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const servicios: Array<{ nombre: string; estado: "operativo" | "degradado" | "caido" }> = [];

  // Plataforma (Postgres).
  try {
    const { error } = await sb.from("organizations").select("id", { head: true, count: "exact" }).limit(1);
    servicios.push({ nombre: "Aplicación", estado: error ? "caido" : "operativo" });
  } catch {
    servicios.push({ nombre: "Aplicación", estado: "caido" });
  }

  // Proveedores de IA (circuit breakers).
  try {
    const { data } = await sb.from("provider_health").select("provider, estado, abierto_hasta");
    const etiqueta: Record<string, string> = {
      anthropic: "Análisis y generación con IA",
      openai: "Búsqueda semántica (embeddings)",
      resend: "Notificaciones por correo",
    };
    for (const row of (data ?? []) as Array<{ provider: string; estado: string; abierto_hasta: string | null }>) {
      let e: "operativo" | "degradado" | "caido" = "operativo";
      if (row.estado === "OPEN") {
        e = row.abierto_hasta && new Date(row.abierto_hasta) <= new Date() ? "degradado" : "caido";
      } else if (row.estado === "HALF_OPEN") {
        e = "degradado";
      }
      servicios.push({ nombre: etiqueta[row.provider] ?? row.provider, estado: e });
    }
  } catch {
    /* no crítico */
  }

  const peor = servicios.some((s) => s.estado === "caido")
    ? "incidente"
    : servicios.some((s) => s.estado === "degradado")
      ? "degradado"
      : "operativo";

  return NextResponse.json({ estado: peor, servicios, ts: new Date().toISOString() });
}
