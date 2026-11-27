// P2 · seguridad — aislamiento entre organizaciones en resolver_modelo_ia y
// verificar_cadena_auditoria. Ambas son SECURITY DEFINER, tienen execute para
// `authenticated` y reciben el uuid de la organización; un usuario de la org A
// podía consultar la política de modelos o la cadena de auditoría de la org B.
// Regresión de la migración 20261127200000_org_propia_resolver_modelo_y_cadena_auditoria
// (mismo patrón que 20261031000000_presupuesto_ia_disponible_org_propia).
//
//   npx supabase start
//   node tests/integration/p2-org-propia-modelo-auditoria.test.mjs
import { createClient } from "@supabase/supabase-js";
import { LOCAL } from "../helpers/local-supabase.mjs";

const URL = process.env.SUPABASE_URL ?? LOCAL.url;
const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? LOCAL.anonKey;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? LOCAL.serviceRoleKey;

if (URL.includes("supabase.co")) {
  console.error("Refusing to run against a hosted/remote project — local only.");
  process.exit(1);
}

const admin = createClient(URL, SERVICE_KEY);
let pass = 0;
let fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}${detail ? " — " + detail : ""}`); }
}
const rnd = () => Math.random().toString(36).slice(2, 10);

async function makeOrgWithUser() {
  const { data: org } = await admin.from("organizations").insert({ nombre: `Org ${rnd()}` }).select("id").single();
  const { data: ticket } = await admin.from("signup_tickets").insert({ organization_id: org.id }).select("id").single();
  const email = `u-${rnd()}@example.org`;
  const { data: u } = await admin.auth.admin.createUser({
    email, password: "TestPassword123!", email_confirm: true,
    user_metadata: { nombre: "T", signup_ticket: ticket.id },
  });
  const anon = createClient(URL, ANON_KEY);
  const { data: sess } = await anon.auth.signInWithPassword({ email, password: "TestPassword123!" });
  const asUser = createClient(URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${sess.session.access_token}` } },
  });
  return { orgId: org.id, userId: u.user.id, asUser };
}

const rechazo42501 = (error) => !!error && /42501/.test(JSON.stringify(error));

async function main() {
  const orgA = await makeOrgWithUser();
  const orgB = await makeOrgWithUser();

  // La org B tiene una política restrictiva (solo Haiku) para que la respuesta
  // de service_role sea distinguible.
  await admin.rpc("aplicar_plan_a_org", { p_org: orgB.orgId, p_plan: "BASE" });

  // Un evento de auditoría en cada org para que la cadena no esté vacía.
  await orgA.asUser.rpc("registrar_auditoria", { p_accion: "test.org_propia", p_recurso_tipo: null, p_recurso_id: null, p_detalle: {} });
  await orgB.asUser.rpc("registrar_auditoria", { p_accion: "test.org_propia", p_recurso_tipo: null, p_recurso_id: null, p_detalle: {} });

  const modelo = (cli, org) =>
    cli.rpc("resolver_modelo_ia", { p_org: org, p_modelo_deseado: "claude-opus-5", p_confianza_baja: false });

  // ── resolver_modelo_ia ──
  {
    const { data, error } = await modelo(orgA.asUser, orgA.orgId);
    check("1. authenticated resuelve el modelo de SU organización", !error && typeof data === "string" && data.length > 0, JSON.stringify(error ?? data));
  }
  {
    const { data, error } = await modelo(orgA.asUser, orgB.orgId);
    check("2. authenticated (org A) NO puede resolver el modelo de la org B", rechazo42501(error) && !data, JSON.stringify(error ?? data));
  }
  {
    const { data, error } = await modelo(orgA.asUser, null);
    check("3. authenticated NO puede pasar p_org nulo", rechazo42501(error) && !data, JSON.stringify(error ?? data));
  }
  {
    const { data, error } = await modelo(admin, orgB.orgId);
    check("4. service_role SÍ resuelve el modelo de cualquier org (BASE -> haiku)", !error && data === "claude-haiku-4-5", JSON.stringify(error ?? data));
  }

  // ── verificar_cadena_auditoria ──
  {
    const { data, error } = await orgA.asUser.rpc("verificar_cadena_auditoria", { p_org: orgA.orgId });
    const v = Array.isArray(data) ? data[0] : data;
    check("5. authenticated verifica la cadena de SU organización", !error && v && Number(v.total) >= 1 && v.rota_en === null, JSON.stringify(error ?? data));
  }
  {
    const { data, error } = await orgA.asUser.rpc("verificar_cadena_auditoria", { p_org: orgB.orgId });
    check("6. authenticated (org A) NO puede verificar la cadena de la org B", rechazo42501(error) && !data?.length, JSON.stringify(error ?? data));
  }
  {
    const { data, error } = await orgA.asUser.rpc("verificar_cadena_auditoria", { p_org: null });
    check("7. authenticated NO puede verificar la cadena sin organización (p_org nulo)", rechazo42501(error) && !data?.length, JSON.stringify(error ?? data));
  }
  {
    const { data, error } = await admin.rpc("verificar_cadena_auditoria", { p_org: orgB.orgId });
    const v = Array.isArray(data) ? data[0] : data;
    check("8. service_role SÍ verifica la cadena de cualquier org", !error && v && Number(v.total) >= 1, JSON.stringify(error ?? data));
  }

  // anon sigue sin execute.
  {
    const anon = createClient(URL, ANON_KEY);
    const { error: e1 } = await anon.rpc("resolver_modelo_ia", { p_org: orgB.orgId, p_modelo_deseado: "claude-opus-5" });
    const { error: e2 } = await anon.rpc("verificar_cadena_auditoria", { p_org: orgB.orgId });
    check("9. anon NO puede llamar ninguna de las dos", !!e1 && !!e2, JSON.stringify([e1, e2]));
  }

  try {
    for (const o of [orgA, orgB]) await admin.auth.admin.deleteUser(o.userId);
    for (const id of [orgA.orgId, orgB.orgId]) await admin.from("organizations").delete().eq("id", id);
  } catch { /* best-effort */ }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
