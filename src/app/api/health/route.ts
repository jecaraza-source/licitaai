import { NextResponse } from "next/server";

// P2 · E4 — liveness. Solo confirma que el proceso responde. Sin auth,
// sin tocar la base de datos. Para el monitoreo de plataforma / balanceador.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ status: "ok", ts: new Date().toISOString() });
}
