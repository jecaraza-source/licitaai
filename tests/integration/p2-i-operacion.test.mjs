// P2 · I — integration: métricas de operación (metricas_operacion) +
// clasificación de severidad del monitoreo.
//
//   npx supabase start
//   node tests/integration/p2-i-operacion.test.mjs
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

async function makeOrg() {
  const { data: org } = await admin.from("organizations").insert({ nombre: `Org ${rnd()}` }).select("id").single();
  const { data: ticket } = await admin.from("signup_tickets").insert({ organization_id: org.id }).select("id").single();
  const email = `u-${rnd()}@example.org`;
  const { data: u } = await admin.auth.admin.createUser({
    email, password: "TestPassword123!", email_confirm: true,
    user_metadata: { nombre: "T", signup_ticket: ticket.id },
  });
  return { orgId: org.id, userId: u.user.id, email };
}

async function main() {
  const o = await makeOrg();

  // Datos de prueba: jobs en varios estados + gasto de IA.
  const ahora = Date.now();
  await admin.from("jobs").insert([
    // arranque lento (12s)
    { organization_id: o.orgId, requested_by: o.userId, tipo: "noop", estado: "COMPLETED",
      created_at: new Date(ahora - 3600_000).toISOString(),
      started_at: new Date(ahora - 3600_000 + 12000).toISOString(),
      finished_at: new Date(ahora - 3500_000).toISOString() },
    { organization_id: o.orgId, requested_by: o.userId, tipo: "noop", estado: "COMPLETED",
      created_at: new Date(ahora - 3000_000).toISOString(),
      started_at: new Date(ahora - 3000_000 + 2000).toISOString(),
      finished_at: new Date(ahora - 2900_000).toISOString() },
    { organization_id: o.orgId, requested_by: o.userId, tipo: "noop", estado: "FAILED",
      created_at: new Date(ahora - 2000_000).toISOString(),
      started_at: new Date(ahora - 2000_000 + 1000).toISOString(),
      finished_at: new Date(ahora - 1900_000).toISOString() },
    // atascado
    { organization_id: o.orgId, requested_by: o.userId, tipo: "noop", estado: "AUTHORIZED",
      created_at: new Date(ahora - 600_000).toISOString() },
  ]);
  await admin.from("jobs_dead_letter").insert({
    job_id: crypto.randomUUID(), organization_id: o.orgId, tipo: "noop", motivo: "max_intentos",
  });
  await admin.from("ai_org_policy").upsert({ organization_id: o.orgId, cuota_mensual_usd: 10 });
  await admin.from("ai_budget_ledger").insert({ organization_id: o.orgId, estado: "CONSUMIDO", monto_usd: 9 }); // 90% de cuota

  const { data: m, error } = await admin.rpc("metricas_operacion");
  check("1. metricas_operacion devuelve un objeto", !error && typeof m === "object", error?.message);
  check("2. cuenta jobs por estado (AUTHORIZED atascado)", (m.jobs.por_estado.AUTHORIZED ?? 0) >= 1);
  check("3. arranque p95 refleja el job lento (>= 10s)", Number(m.jobs.arranque_seg.p95) >= 10, JSON.stringify(m.jobs.arranque_seg));
  check("4. sin_intervencion_pct calculado (2 COMPLETED / 3 terminados ≈ 66.7)", m.jobs.sin_intervencion_pct != null && m.jobs.sin_intervencion_pct < 98);
  check("5. dead_letter contabilizado", m.jobs.dead_letter.ultima_hora >= 1);
  check("6. jobs atascados >= 1", m.jobs.atascados >= 1);
  check("7. circuit_breakers incluye anthropic/openai/resend", Array.isArray(m.circuit_breakers) && m.circuit_breakers.length >= 3);
  const org = m.consumo_ia.top_orgs.find((x) => x.organization_id === o.orgId);
  check("8. consumo_ia.top_orgs incluye la org con su % de cuota", !!org && org.pct_cuota >= 80, JSON.stringify(org));
  check("9. orgs_sobre_80pct cuenta la org", m.consumo_ia.orgs_sobre_80pct >= 1);

  // RLS: un usuario autenticado NO puede llamar metricas_operacion.
  {
    const anon = createClient(URL, ANON_KEY);
    const { data: sess } = await anon.auth.signInWithPassword({ email: o.email, password: "TestPassword123!" });
    const asUser = createClient(URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${sess.session.access_token}` } },
    });
    const { error: e } = await asUser.rpc("metricas_operacion");
    check("10. metricas_operacion no es ejecutable por un usuario autenticado", !!e);
  }

  // limpieza
  try {
    await admin.from("jobs").delete().eq("organization_id", o.orgId);
    await admin.from("jobs_dead_letter").delete().eq("organization_id", o.orgId);
    await admin.from("ai_budget_ledger").delete().eq("organization_id", o.orgId);
    await admin.auth.admin.deleteUser(o.userId);
    await admin.from("organizations").delete().eq("id", o.orgId);
  } catch { /* best-effort */ }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
