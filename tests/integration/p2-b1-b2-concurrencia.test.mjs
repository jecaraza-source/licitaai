// P2 punch-list B1 + B2 — cupo de concurrencia por organización y fairness
// round-robin en reclamar_jobs.
//
// Usage:
//   npx supabase start
//   node tests/integration/p2-b1-b2-concurrencia.test.mjs
import { createClient } from "@supabase/supabase-js";
import { LOCAL } from "../helpers/local-supabase.mjs";

const URL = process.env.SUPABASE_URL ?? LOCAL.url;
const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? LOCAL.anonKey;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? LOCAL.serviceRoleKey;

if (URL.includes("supabase.co")) {
  console.error("Refusing to run against a remote project.");
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

async function orgConUsuario(maxConcurrent) {
  const { data: org } = await admin.from("organizations").insert({ nombre: `Org ${rnd()}` }).select("id").single();
  const { data: ticket } = await admin.from("signup_tickets").insert({ organization_id: org.id }).select("id").single();
  const email = `u-${rnd()}@example.org`;
  const { data: userData } = await admin.auth.admin.createUser({
    email, password: "TestPassword123!", email_confirm: true,
    user_metadata: { nombre: "Test", signup_ticket: ticket.id },
  });
  const anon = createClient(URL, ANON_KEY);
  const { data: session } = await anon.auth.signInWithPassword({ email, password: "TestPassword123!" });
  const asUser = createClient(URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${session.session.access_token}` } },
  });
  if (maxConcurrent != null) {
    await admin
      .from("ai_org_policy")
      .upsert({ organization_id: org.id, max_concurrent_jobs: maxConcurrent });
  }
  return { orgId: org.id, userId: userData.user.id, asUser };
}

async function crearNoop(asUser, n) {
  const ids = [];
  for (let i = 0; i < n; i++) {
    const { data, error } = await asUser.rpc("crear_job", { p_tipo: "noop" });
    if (error) throw new Error(`crear_job: ${error.message}`);
    ids.push(data.id);
  }
  return ids;
}

async function main() {
  // Aislamiento: limpiar jobs no terminales de corridas previas.
  await admin.from("jobs").delete().in("estado", ["PENDING", "AUTHORIZED", "RETRYING", "RUNNING"]);

  // ── B1 — cupo de concurrencia por organización ────────────────────────
  {
    const org = await orgConUsuario(2); // max_concurrent_jobs = 2
    await crearNoop(org.asUser, 5);

    const { data: r1 } = await admin.rpc("reclamar_jobs", { p_worker_id: "w1", p_limite: 10 });
    check("B1.1 con cupo 2 y 5 jobs, reclamar_jobs solo reclama 2", (r1 ?? []).length === 2, `reclamó ${r1?.length}`);

    // Sin liberar los 2 en curso, no se puede reclamar más de esa org.
    const { data: r2 } = await admin.rpc("reclamar_jobs", { p_worker_id: "w2", p_limite: 10 });
    check("B1.2 con 2 en curso y cupo 2, no se reclama nada más de esa org", (r2 ?? []).length === 0, `reclamó ${r2?.length}`);

    // Al completar uno, se libera un espacio.
    await admin.rpc("completar_job", { p_job_id: r1[0].id, p_result_ref: {} });
    const { data: r3 } = await admin.rpc("reclamar_jobs", { p_worker_id: "w3", p_limite: 10 });
    check("B1.3 al completar 1, se reclama exactamente 1 más", (r3 ?? []).length === 1, `reclamó ${r3?.length}`);

    await admin.from("jobs").delete().eq("organization_id", org.orgId);
    await admin.from("organizations").delete().eq("id", org.orgId);
  }

  // ── B1 — org sin fila en ai_org_policy usa el default (3) ─────────────
  {
    const org = await orgConUsuario(null); // sin fila de política
    await crearNoop(org.asUser, 6);
    const { data: r } = await admin.rpc("reclamar_jobs", { p_worker_id: "w", p_limite: 10 });
    check("B1.4 org sin política usa el default de 3", (r ?? []).length === 3, `reclamó ${r?.length}`);
    await admin.from("jobs").delete().eq("organization_id", org.orgId);
    await admin.from("organizations").delete().eq("id", org.orgId);
  }

  // ── B2 — round-robin: 1 de cada org antes que 2 de una ───────────────
  {
    const a = await orgConUsuario(10);
    const b = await orgConUsuario(10);
    await crearNoop(a.asUser, 3);
    await crearNoop(b.asUser, 3);

    const { data: r } = await admin.rpc("reclamar_jobs", { p_worker_id: "w", p_limite: 2 });
    const orgs = new Set((r ?? []).map((j) => j.organization_id));
    check(
      "B2.1 con 2 orgs esperando y limite=2, se reclama 1 de cada una (no 2 de la misma)",
      (r ?? []).length === 2 && orgs.size === 2,
      `orgs distintas: ${orgs.size}`,
    );

    for (const org of [a, b]) {
      await admin.from("jobs").delete().eq("organization_id", org.orgId);
      await admin.from("organizations").delete().eq("id", org.orgId);
    }
  }

  // ── recuperación: un RUNNING con lease vencido se retoma pese al cupo ─
  {
    const org = await orgConUsuario(1);
    const [j1, j2] = await crearNoop(org.asUser, 2);
    await admin.rpc("reclamar_jobs", { p_worker_id: "w", p_limite: 10 }); // toma j1 (cupo 1)
    // Simular worker muerto: lease vencido en j1.
    await admin.from("jobs").update({ lease_expires_at: new Date(Date.now() - 60000).toISOString() }).eq("id", j1);

    const { data: r } = await admin.rpc("reclamar_jobs", { p_worker_id: "w2", p_limite: 10 });
    const ids = new Set((r ?? []).map((j) => j.id));
    check(
      "B1.5 un RUNNING con lease vencido se retoma aunque la org esté en su cupo",
      ids.has(j1),
      `reclamó: ${[...ids].join(",")}`,
    );
    check("B1.6 ese retomo NO arranca además el job fresco (respeta cupo=1)", !ids.has(j2));

    await admin.from("jobs").delete().eq("organization_id", org.orgId);
    await admin.from("organizations").delete().eq("id", org.orgId);
  }

  // ── carrera: N workers concurrentes NUNCA reclaman el mismo job ──────
  {
    const org = await orgConUsuario(100);
    await crearNoop(org.asUser, 30);

    // 6 llamadas concurrentes a reclamar_jobs (como 6 workers).
    const lotes = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        admin.rpc("reclamar_jobs", { p_worker_id: `race-w${i}`, p_limite: 8 }).then((r) => r.data ?? []),
      ),
    );
    const todos = lotes.flat();
    const ids = todos.map((j) => j.id);
    check(
      "RACE 1. ningún job fue reclamado por dos workers a la vez",
      new Set(ids).size === ids.length,
      `${ids.length} reclamos, ${new Set(ids).size} únicos`,
    );

    const { data: filas } = await admin
      .from("jobs")
      .select("intentos")
      .eq("organization_id", org.orgId)
      .eq("estado", "RUNNING");
    check(
      "RACE 2. ningún job RUNNING tiene intentos > 1 (no doble arranque)",
      (filas ?? []).every((f) => f.intentos === 1),
      `intentos: ${(filas ?? []).map((f) => f.intentos).join(",")}`,
    );

    await admin.from("jobs").delete().eq("organization_id", org.orgId);
    await admin.from("organizations").delete().eq("id", org.orgId);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
