// P2 · I6/I7 — integration: consentimiento, audit_log inmutable, planes,
// métricas de valor (migración 20260901000000).
//
//   npx supabase start
//   node tests/integration/p2-i6-producto.test.mjs
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

async function main() {
  const orgA = await makeOrgWithUser();
  const orgB = await makeOrgWithUser();

  // 1. aceptar_terminos.
  {
    const { error } = await orgA.asUser.rpc("aceptar_terminos", { p_version: "2026-08-27" });
    check("1. aceptar_terminos no falla", !error, error?.message);
    const { data } = await admin.from("users").select("terminos_version, terminos_aceptados_at").eq("id", orgA.userId).single();
    check("2. users.terminos_version / _aceptados_at quedaron fijados", data.terminos_version === "2026-08-27" && !!data.terminos_aceptados_at);
  }

  // 2. registrar_auditoria — cadena por hash.
  {
    await orgA.asUser.rpc("registrar_auditoria", { p_accion: "a1", p_recurso_tipo: "licitacion", p_recurso_id: null, p_detalle: { x: 1 } });
    await orgA.asUser.rpc("registrar_auditoria", { p_accion: "a2", p_detalle: {} });
    const { data: filas } = await admin.from("audit_log").select("*").eq("organization_id", orgA.orgId).order("id");
    check("3. registrar_auditoria escribió 2 filas con hash", filas.length >= 2 && filas.every((f) => !!f.hash));
    check("4. la segunda fila encadena con la primera (prev_hash)", filas[1].prev_hash === filas[0].hash);

    const { data: verif } = await admin.rpc("verificar_cadena_auditoria", { p_org: orgA.orgId });
    const v = Array.isArray(verif) ? verif[0] : verif;
    check("5. verificar_cadena_auditoria: cadena íntegra (rota_en = null)", v.rota_en === null && Number(v.total) >= 2);
  }

  // 3. audit_log inmutable.
  {
    const { data: fila } = await admin.from("audit_log").select("id").eq("organization_id", orgA.orgId).limit(1).single();
    const { error: eUpd } = await admin.from("audit_log").update({ accion: "hackeada" }).eq("id", fila.id);
    check("6. audit_log rechaza UPDATE (incluso por service_role)", !!eUpd);
    const { error: eDel } = await admin.from("audit_log").delete().eq("id", fila.id);
    check("7. audit_log rechaza DELETE", !!eDel);
    const { error: eIns } = await orgA.asUser.from("audit_log").insert({ accion: "x", hash: "y" });
    check("8. un usuario no puede INSERT directo en audit_log (RLS)", !!eIns);
  }

  // 4. RLS entre organizaciones.
  {
    const { data } = await orgB.asUser.from("audit_log").select("id").eq("organization_id", orgA.orgId);
    check("9. org B no ve la bitácora de org A", (data ?? []).length === 0);
    const { data: propias } = await orgA.asUser.from("audit_log").select("id").eq("organization_id", orgA.orgId);
    check("10. org A ve su propia bitácora", (propias ?? []).length >= 2);
  }

  // 5. aplicar_plan_a_org.
  {
    const { error } = await admin.rpc("aplicar_plan_a_org", { p_org: orgA.orgId, p_plan: "PRO" });
    check("11. aplicar_plan_a_org(PRO) no falla", !error, error?.message);
    const { data: org } = await admin.from("organizations").select("plan").eq("id", orgA.orgId).single();
    const { data: pol } = await admin.from("ai_org_policy").select("cuota_mensual_usd, max_concurrent_jobs").eq("organization_id", orgA.orgId).single();
    check("12. el plan y la política de IA se aplicaron (PRO -> $60/mes, 8 concurrentes)",
      org.plan === "PRO" && Number(pol.cuota_mensual_usd) === 60 && pol.max_concurrent_jobs === 8);

    const { error: eUser } = await orgA.asUser.rpc("aplicar_plan_a_org", { p_org: orgA.orgId, p_plan: "ENTERPRISE" });
    check("13. un usuario no puede cambiar el plan (solo service_role)", !!eUser);
  }

  // 6. metricas_valor (keyed por auth.uid()).
  {
    const { data, error } = await orgA.asUser.rpc("metricas_valor");
    check("14. metricas_valor devuelve el blob de la organización del llamante",
      !error && data.organization_id === orgA.orgId && "tasa_aceptacion_humana_pct" in data, error?.message);
  }

  // limpieza (audit_log no se puede borrar; se limpia con db reset)
  try {
    await admin.auth.admin.deleteUser(orgA.userId);
    await admin.auth.admin.deleteUser(orgB.userId);
  } catch { /* best-effort — organizations con audit_log no se pueden borrar por el FK on delete set null; ok */ }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
