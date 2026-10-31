// P2 · seguridad — aislamiento entre organizaciones en ai_policy_de_org.
// La función es SECURITY DEFINER, recibe el uuid de la organización y crea
// la política por defecto si no existe; con execute para `authenticated`,
// un usuario de la org A podía leer/crear la política de la org B.
// Regresión de las migraciones 20261030000000_revoke_ai_policy_de_org_authenticated
// y 20261031000000_presupuesto_ia_disponible_org_propia (mismo patrón).
//
//   npx supabase start
//   node tests/integration/p2-grants-ai-policy-de-org.test.mjs
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

const filasPolitica = async (orgId) => {
  const { count } = await admin.from("ai_org_policy").select("organization_id", { count: "exact", head: true }).eq("organization_id", orgId);
  return count ?? 0;
};

async function main() {
  const orgA = await makeOrgWithUser();
  const orgB = await makeOrgWithUser();
  const orgs = [orgA, orgB];

  // La org B tiene política (la crea service_role); la org C no tiene ninguna.
  const { data: polB } = await admin.rpc("ai_policy_de_org", { p_org: orgB.orgId });
  const { data: orgC } = await admin.from("organizations").insert({ nombre: `Org ${rnd()}` }).select("id").single();

  // 1. Un usuario de la org A no puede leer la política de la org B.
  {
    const { data, error } = await orgA.asUser.rpc("ai_policy_de_org", { p_org: orgB.orgId });
    check("1. authenticated (org A) NO puede leer la política de la org B", !!error && !data, JSON.stringify(error ?? data));
    check("1b. el rechazo es por permisos (permission denied / 404 de PostgREST)", !!error && /permission denied|42501|not find|PGRST202/i.test(JSON.stringify(error)), JSON.stringify(error));
  }

  // 2. Tampoco puede crear una política para una organización que no tiene.
  {
    const { error } = await orgA.asUser.rpc("ai_policy_de_org", { p_org: orgC.id });
    check("2. authenticated NO puede invocar ai_policy_de_org sobre una org sin política", !!error, JSON.stringify(error));
    check("2b. no se creó la fila de política de la org C", (await filasPolitica(orgC.id)) === 0);
  }

  // 3. Ni siquiera sobre su propia org: la función es solo service_role.
  {
    const { error } = await orgA.asUser.rpc("ai_policy_de_org", { p_org: orgA.orgId });
    check("3. authenticated NO puede llamar ai_policy_de_org() ni con su propia org", !!error, JSON.stringify(error));
  }

  // 4. anon tampoco.
  {
    const anon = createClient(URL, ANON_KEY);
    const { error } = await anon.rpc("ai_policy_de_org", { p_org: orgB.orgId });
    check("4. anon NO puede llamar ai_policy_de_org()", !!error, JSON.stringify(error));
  }

  // 5. service_role conserva el acceso.
  {
    const { data, error } = await admin.rpc("ai_policy_de_org", { p_org: orgB.orgId });
    check("5. service_role SÍ puede llamar ai_policy_de_org()", !error && data?.organization_id === orgB.orgId && data.cuota_mensual_usd === polB?.cuota_mensual_usd, error?.message);
  }

  // 6. Los llamadores SECURITY DEFINER siguen funcionando para authenticated
  //    (ejecutan con los privilegios del dueño, no necesitan el grant).
  {
    const { error } = await orgA.asUser.rpc("presupuesto_ia_disponible", { p_org: orgA.orgId });
    check("6. presupuesto_ia_disponible() sigue funcionando para authenticated", !error, error?.message);
    const { data: reserva, error: e2 } = await orgA.asUser.rpc("reservar_presupuesto_ia", { p_tipo: "analisis", p_estimado_usd: 0.01 });
    check("7. reservar_presupuesto_ia() sigue funcionando para authenticated", !e2 && !!reserva, e2?.message);
  }

  // 8. La propia política sigue legible por RLS, y solo la de su org.
  {
    const { data } = await orgA.asUser.from("ai_org_policy").select("organization_id");
    const ids = (data ?? []).map((r) => r.organization_id);
    check("8. la UI sigue leyendo ai_org_policy por RLS, solo de su org", ids.includes(orgA.orgId) && !ids.includes(orgB.orgId), JSON.stringify(ids));
  }

  // 9–11. presupuesto_ia_disponible solo responde por la org del llamante
  //       (migración 20261031000000_presupuesto_ia_disponible_org_propia).
  {
    const { data, error } = await orgA.asUser.rpc("presupuesto_ia_disponible", { p_org: orgB.orgId });
    check("9. authenticated (org A) NO puede leer el presupuesto de IA de la org B", !!error && !data?.length, JSON.stringify(error ?? data));
    check("9b. el rechazo es 42501", error?.code === "42501", JSON.stringify(error));
  }
  {
    const { error } = await orgA.asUser.rpc("presupuesto_ia_disponible", { p_org: orgC.id });
    check("10. authenticated NO puede consultar el presupuesto de una org sin política", !!error, JSON.stringify(error));
    check("10b. no se creó la fila de política de la org C", (await filasPolitica(orgC.id)) === 0);
  }
  {
    const { data, error } = await admin.rpc("presupuesto_ia_disponible", { p_org: orgB.orgId });
    check("11. service_role SÍ puede consultar el presupuesto de cualquier org", !error && data?.length === 1, error?.message);
  }

  try {
    for (const o of orgs) await admin.auth.admin.deleteUser(o.userId);
    for (const id of [orgA.orgId, orgB.orgId, orgC.id]) await admin.from("organizations").delete().eq("id", id);
  } catch { /* best-effort */ }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
