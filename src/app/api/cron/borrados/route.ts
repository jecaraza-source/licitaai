import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import * as Sentry from "@sentry/nextjs";
import { estaAutorizadoCron } from "@/lib/cron-auth";

// P2 · H5 — motor del borrado de organización con ventana de gracia
// (ADR 0010). Vercel Cron diario. Dos pasos:
//
//   1. promover_borrados_vencidos()      PROGRAMADA vencida (+7d) y con el
//                                        export COMPLETED -> EN_PROCESO +
//                                        encola el job borrar-organizacion
//   2. finalizar_borrados_completados()  el job terminó de purgar
//                                        (datos_purgados_at) y está
//                                        COMPLETED -> DELETE de la
//                                        organización (cascade)
//
// El paso 2 va aparte del job porque `DELETE FROM organizations` dispara
// el cascade que borraría la propia fila `jobs` del job de borrado.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!estaAutorizadoCron(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Configuración incompleta" }, { status: 500 });

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: promovidos, error: e1 } = await supabase.rpc("promover_borrados_vencidos");
  const { data: finalizados, error: e2 } = await supabase.rpc("finalizar_borrados_completados");

  if (e1 || e2) {
    Sentry.captureException(e1 ?? e2, { tags: { cron: "borrados" } });
    return NextResponse.json({ error: "motor de borrados con fallo", e1: e1?.message, e2: e2?.message }, { status: 500 });
  }

  const nProm = (promovidos?.promovidos ?? []).length;
  const nFin = (finalizados?.finalizados ?? []).length;
  if (nProm > 0 || nFin > 0) {
    Sentry.captureMessage(`[borrados] promovidos=${nProm} finalizados=${nFin}`, {
      level: "info",
      extra: { promovidos, finalizados },
    });
    console.log("[borrados]", JSON.stringify({ promovidos, finalizados }));
  }

  return NextResponse.json({ ok: true, promovidos, finalizados });
}
