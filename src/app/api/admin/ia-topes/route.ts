import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { rolPlataforma } from "@/lib/platform-admin";
import { topesSchema } from "@/lib/ia-topes";

// Consola de IA — cambia los topes de gasto de una organización. Solo un
// ADMIN de plataforma (equipo LicitaAI): las empresas comparten las cuentas
// de API, así que ninguna puede subirse su propio tope.
export const dynamic = "force-dynamic";

export async function PATCH(req: Request) {
  const sb = await createServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if ((await rolPlataforma(sb, user.id)) !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const parsed = topesSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
      { status: 400 },
    );
  }
  const { organization_id, cuota_mensual_usd, limite_diario_usd, topes_usd_activos } = parsed.data;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "Configuración incompleta" }, { status: 500 });
  }
  const service = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await service
    .from("ai_org_policy")
    .update({ cuota_mensual_usd, limite_diario_usd, topes_usd_activos })
    .eq("organization_id", organization_id)
    .select("organization_id, cuota_mensual_usd, limite_diario_usd, topes_usd_activos")
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: "No se pudieron guardar los topes" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "La organización no tiene política de IA" }, { status: 404 });
  }
  return NextResponse.json({ data });
}
