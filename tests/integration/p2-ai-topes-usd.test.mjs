// Consola de IA — topes de gasto en USD
// (supabase/migrations/20261030190000_ai_topes_usd.sql).
//
// check_ai_budget es el único punto por el que pasan las llamadas directas a
// IA (rutas de Next y Edge Functions). Estas pruebas comprueban que: (1) con
// topes_usd_activos=false nada cambia, (2) con topes activos se bloquea al
// alcanzar el límite diario o la cuota mensual, (3) un modelo sin precio se
// cobra al precio más alto (no se subestima), (4) cada organización tiene su
// propio gasto, (5) ai_estado_consumo devuelve solo la organización del
// llamante y el helper interno no es invocable por un usuario.
//
// Usage:
//   npx supabase start
//   node tests/integration/p2-ai-topes-usd.test.mjs
import { createClient } from "@supabase/supabase-js";
import { LOCAL } from "../helpers/local-supabase.mjs";

const URL = process.env.SUPABASE_URL ?? LOCAL.url;
const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? LOCAL.anonKey;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? LOCAL.serviceRoleKey;

if (URL.includes("supabase.co")) {
  console.error("Refusing to run: SUPABASE_URL looks like a hosted/remote project, not local.");
  process.exit(1);
}

const admin = createClient(URL, SERVICE_KEY);

let pass = 0;
let fail = 0;
function check(name, ok, detail) {
  if (ok) {
    pass++;
    console.log(`PASS  ${name}`);
  } else {
    fail++;
    console.log(`FAIL  ${name}${detail ? " — " + detail : ""}`);
  }
}

function rnd() {
  return Math.random().toString(36).slice(2, 10);
}

async function makeOrgWithUser() {
  const { data: org } = await admin.from("organizations").insert({ nombre: `Org ${rnd()}` }).select("id").single();
  const { data: ticket } = await admin.from("signup_tickets").insert({ organization_id: org.id }).select("id").single();
  const email = `u-${rnd()}@example.org`;
  const { data: userData, error } = await admin.auth.admin.createUser({
    email,
    password: "TestPassword123!",
    email_confirm: true,
    user_metadata: { nombre: "Test User", signup_ticket: ticket.id },
  });
  if (error) throw error;
  const anon = createClient(URL, ANON_KEY);
  const { data: session } = await anon.auth.signInWithPassword({ email, password: "TestPassword123!" });
  const asUser = createClient(URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${session.session.access_token}` } },
  });
  return { orgId: org.id, userId: userData.user.id, asUser };
}

async function politica(orgId, valores) {
  const { error } = await admin
    .from("ai_org_policy")
    .upsert({ organization_id: orgId, ...valores }, { onConflict: "organization_id" });
  if (error) throw error;
}

async function usar(org, modelo, input, output) {
  const { error } = await org.asUser.rpc("registrar_uso_ia", {
    p_funcion: `topes-${rnd()}`,
    p_modelo: modelo,
    p_input_tokens: input,
    p_output_tokens: output,
  });
  if (error) throw error;
}

async function main() {
  // -----------------------------------------------------------------------
  // 1. Por defecto los topes en USD están apagados: un gasto muy por encima
  //    de un límite diario diminuto NO bloquea (comportamiento previo).
  // -----------------------------------------------------------------------
  {
    const org = await makeOrgWithUser();
    await politica(org.orgId, { cuota_mensual_usd: 0.001, limite_diario_usd: 0.001 });
    const { data: fila } = await admin.from("ai_org_policy").select("topes_usd_activos").eq("organization_id", org.orgId).single();
    check("1. topes_usd_activos nace en false", fila?.topes_usd_activos === false, JSON.stringify(fila));

    await usar(org, "claude-sonnet-5", 1_000_000, 0); // ≈ $2.00
    const { data: dentro } = await org.asUser.rpc("check_ai_budget");
    check("2. con los topes apagados, un gasto sobre el límite diario no bloquea", dentro === true);
  }

  // -----------------------------------------------------------------------
  // 2. Topes activos: bloquea por límite diario.
  // -----------------------------------------------------------------------
  {
    const org = await makeOrgWithUser();
    await politica(org.orgId, { cuota_mensual_usd: 100, limite_diario_usd: 1, topes_usd_activos: true });
    const { data: antes } = await org.asUser.rpc("check_ai_budget");
    check("3. con topes activos y sin gasto, se permite", antes === true);

    await usar(org, "claude-sonnet-5", 1_000_000, 0); // $2.00 ≥ $1.00 diario
    const { data: despues } = await org.asUser.rpc("check_ai_budget");
    check("4. con topes activos, se bloquea al alcanzar el límite diario en USD", despues === false);
  }

  // -----------------------------------------------------------------------
  // 3. Topes activos: bloquea por cuota mensual aunque el diario sobre.
  // -----------------------------------------------------------------------
  {
    const org = await makeOrgWithUser();
    await politica(org.orgId, { cuota_mensual_usd: 1, limite_diario_usd: 1, topes_usd_activos: true });
    await usar(org, "claude-sonnet-5", 0, 200_000); // $2.00 de salida ≥ $1.00
    const { data: dentro } = await org.asUser.rpc("check_ai_budget");
    check("5. se bloquea al alcanzar la cuota mensual (cuenta tokens de salida)", dentro === false);
  }

  // -----------------------------------------------------------------------
  // 4. Con topes holgados sigue permitiendo.
  // -----------------------------------------------------------------------
  {
    const org = await makeOrgWithUser();
    await politica(org.orgId, { cuota_mensual_usd: 100, limite_diario_usd: 50, topes_usd_activos: true });
    await usar(org, "claude-sonnet-5", 100_000, 10_000); // ≈ $0.30
    const { data: dentro } = await org.asUser.rpc("check_ai_budget");
    check("6. con topes holgados se sigue permitiendo", dentro === true);
  }

  // -----------------------------------------------------------------------
  // 5. Un tope en 0 con topes activos bloquea todo (interruptor de corte).
  // -----------------------------------------------------------------------
  {
    const org = await makeOrgWithUser();
    await politica(org.orgId, { cuota_mensual_usd: 0, limite_diario_usd: 0, topes_usd_activos: true });
    const { data: dentro } = await org.asUser.rpc("check_ai_budget");
    check("7. tope 0 con topes activos bloquea incluso sin gasto", dentro === false);
  }

  // -----------------------------------------------------------------------
  // 6. Modelo sin precio: se cobra al precio más alto del catálogo.
  // -----------------------------------------------------------------------
  {
    const org = await makeOrgWithUser();
    await politica(org.orgId, { cuota_mensual_usd: 100, limite_diario_usd: 5, topes_usd_activos: true });
    await usar(org, `modelo-desconocido-${rnd()}`, 1_000_000, 0); // al precio máximo ≥ $10
    const { data: dentro } = await org.asUser.rpc("check_ai_budget");
    check("8. un modelo sin precio cuenta al precio más alto (se sobreestima, no se subestima)", dentro === false);
  }

  // -----------------------------------------------------------------------
  // 7. Aislamiento: el gasto de una organización no cuenta en otra.
  // -----------------------------------------------------------------------
  {
    const gastadora = await makeOrgWithUser();
    const tranquila = await makeOrgWithUser();
    await politica(gastadora.orgId, { cuota_mensual_usd: 100, limite_diario_usd: 1, topes_usd_activos: true });
    await politica(tranquila.orgId, { cuota_mensual_usd: 100, limite_diario_usd: 1, topes_usd_activos: true });
    await usar(gastadora, "claude-sonnet-5", 1_000_000, 0);
    const { data: a } = await gastadora.asUser.rpc("check_ai_budget");
    const { data: b } = await tranquila.asUser.rpc("check_ai_budget");
    check("9. la organización que gastó queda bloqueada", a === false);
    check("10. otra organización con los mismos topes no se ve afectada", b === true);
  }

  // -----------------------------------------------------------------------
  // 8. ai_estado_consumo: solo la organización del llamante, con su gasto.
  // -----------------------------------------------------------------------
  {
    const org = await makeOrgWithUser();
    const otra = await makeOrgWithUser();
    await politica(org.orgId, { cuota_mensual_usd: 20, limite_diario_usd: 4, topes_usd_activos: true });
    await usar(org, "claude-sonnet-5", 500_000, 0); // $1.00
    await usar(otra, "claude-sonnet-5", 5_000_000, 0); // $10.00 — no debe aparecer en org

    const { data: est, error } = await org.asUser.rpc("ai_estado_consumo");
    check("11. ai_estado_consumo responde a un usuario autenticado", !error && !!est, error?.message);
    check("12. devuelve su organización y no otra", est?.organization_id === org.orgId, JSON.stringify(est));
    check("13. el gasto del día es el suyo ($1.00), sin sumar el de otra organización", Math.abs(est?.gasto_hoy_usd - 1) < 0.001, JSON.stringify(est));
    check("14. devuelve los topes y el estado de activación", est?.cuota_mensual_usd === 20 && est?.limite_diario_usd === 4 && est?.topes_usd_activos === true, JSON.stringify(est));

    const anon = createClient(URL, ANON_KEY);
    const { error: eAnon } = await anon.rpc("ai_estado_consumo");
    check("15. ai_estado_consumo rechaza a un llamante sin sesión", !!eAnon);
  }

  // -----------------------------------------------------------------------
  // 9. El helper interno no es invocable por un usuario (podría consultar el
  //    gasto de cualquier organización pasando su id).
  // -----------------------------------------------------------------------
  {
    const org = await makeOrgWithUser();
    const otra = await makeOrgWithUser();
    const { error } = await org.asUser.rpc("_gasto_ia_uso_log", {
      p_org: otra.orgId,
      p_desde: "2000-01-01T00:00:00Z",
    });
    check("16. _gasto_ia_uso_log no es ejecutable por un usuario autenticado", !!error);
  }

  // -----------------------------------------------------------------------
  // 10. El usuario no puede cambiar su propia política (sin política RLS de
  //     escritura): no puede subirse el tope.
  // -----------------------------------------------------------------------
  {
    const org = await makeOrgWithUser();
    await politica(org.orgId, { cuota_mensual_usd: 1, limite_diario_usd: 1, topes_usd_activos: true });
    await org.asUser.from("ai_org_policy").update({ cuota_mensual_usd: 9999, limite_diario_usd: 9999 }).eq("organization_id", org.orgId);
    const { data: fila } = await admin.from("ai_org_policy").select("cuota_mensual_usd, limite_diario_usd").eq("organization_id", org.orgId).single();
    check("17. un usuario no puede subirse sus propios topes", Number(fila.cuota_mensual_usd) === 1 && Number(fila.limite_diario_usd) === 1, JSON.stringify(fila));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
