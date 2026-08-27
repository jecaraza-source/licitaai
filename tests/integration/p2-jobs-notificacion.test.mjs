// P2 · A6 — integration tests para la notificación de jobs largos
// (migración 20260827006000 + _shared/job-notify.ts).
//
// El envío real de correo requiere RESEND_API_KEY (no configurada en
// local); estos tests verifican el guard de idempotencia y que el worker
// marca notificado_at solo para jobs que superaron el umbral de 60s.
//
// Usage:
//   npx supabase start   (o stop/start si el edge runtime no recogió job-notify)
//   node tests/integration/p2-jobs-notificacion.test.mjs
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";
const FUNCTIONS_URL = `${URL}/functions/v1`;

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function invokeWorker() {
  return fetch(`${FUNCTIONS_URL}/job-worker`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
  });
}

async function main() {
  const { data: org } = await admin.from("organizations").insert({ nombre: `Org ${rnd()}` }).select("id").single();
  const { data: ticket } = await admin.from("signup_tickets").insert({ organization_id: org.id }).select("id").single();
  const { data: u } = await admin.auth.admin.createUser({
    email: `u-${rnd()}@example.org`, password: "TestPassword123!", email_confirm: true,
    user_metadata: { nombre: "Solicitante", signup_ticket: ticket.id },
  });
  const userId = u.user.id;

  const insertarJob = async (createdAtMsAtras) => {
    const { data } = await admin.from("jobs").insert({
      organization_id: org.id, requested_by: userId, tipo: "noop", estado: "AUTHORIZED",
      input_json: { modo: "ok" },
      created_at: new Date(Date.now() - createdAtMsAtras).toISOString(),
      authorized_at: new Date(Date.now() - createdAtMsAtras).toISOString(),
    }).select("id").single();
    return data.id;
  };
  const jobRow = async (id) => (await admin.from("jobs").select("*").eq("id", id).single()).data;

  // 1. marcar_job_notificado es un guard atómico (true una vez, false después).
  {
    const id = await insertarJob(0);
    const { data: a } = await admin.rpc("marcar_job_notificado", { p_job_id: id });
    const { data: b } = await admin.rpc("marcar_job_notificado", { p_job_id: id });
    check("1. marcar_job_notificado: primer llamado true, segundo false", a === true && b === false);
    check("2. notificado_at quedó fijado", !!(await jobRow(id)).notificado_at);
  }

  // 2. Un job que tardó > 60s, al completarse, queda notificado_at.
  {
    const id = await insertarJob(90_000); // creado hace 90s
    await invokeWorker().then((r) => r.json());
    await sleep(500);
    const j = await jobRow(id);
    check("3. job largo (>60s) -> COMPLETED", j.estado === "COMPLETED");
    check("4. job largo queda con notificado_at fijado por el worker", !!j.notificado_at);
  }

  // 3. Un job rápido (< 60s) NO se notifica.
  {
    const id = await insertarJob(2_000);
    await invokeWorker().then((r) => r.json());
    await sleep(500);
    const j = await jobRow(id);
    check("5. job rápido (<60s) -> COMPLETED", j.estado === "COMPLETED");
    check("6. job rápido NO queda con notificado_at", j.notificado_at === null);
  }

  // 4. Un job largo que FALLA definitivamente también se marca.
  {
    const { data } = await admin.from("jobs").insert({
      organization_id: org.id, requested_by: userId, tipo: "noop", estado: "AUTHORIZED",
      input_json: { modo: "falla_fatal" }, max_intentos: 1,
      created_at: new Date(Date.now() - 120_000).toISOString(),
      authorized_at: new Date(Date.now() - 120_000).toISOString(),
    }).select("id").single();
    await invokeWorker().then((r) => r.json());
    await sleep(500);
    const j = await jobRow(data.id);
    check("7. job largo que FAILED también queda notificado_at", j.estado === "FAILED" && !!j.notificado_at);
  }

  // limpieza
  try {
    await admin.from("jobs").delete().eq("organization_id", org.id);
    await admin.from("jobs_dead_letter").delete().eq("organization_id", org.id);
    await admin.auth.admin.deleteUser(userId);
    await admin.from("organizations").delete().eq("id", org.id);
  } catch { /* best-effort */ }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
