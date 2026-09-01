import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { esPlatformAdmin } from "@/lib/platform-admin";

// P2 · I — métricas de operación cross-organización para el dashboard de
// salud. Requiere sesión + fila en public.platform_admins (ADMIN u OPERADOR).
export const dynamic = "force-dynamic";

export async function GET() {
  const sb = await createServerClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (!(await esPlatformAdmin(sb, user.id))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "Configuración incompleta" }, { status: 500 });
  }
  const service = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await service.rpc("metricas_operacion");
  if (error) {
    return NextResponse.json({ error: "No se pudieron obtener las métricas" }, { status: 500 });
  }
  return NextResponse.json({ data });
}
