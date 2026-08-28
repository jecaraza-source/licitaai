// P2 · A2 — integration tests para el worker de jobs (Edge Function
// job-worker + _shared/job-runner.ts + handler noop).
//
// Requiere que el edge runtime local haya recogido la función:
//   npx supabase start   (o stop/start si ya estaba corriendo antes de A2)
//   node tests/integration/p2-job-worker.test.mjs
import { createClient } from "@supabase/supabase-js";
import { LOCAL } from "../helpers/local-supabase.mjs";

const URL = process.env.SUPABASE_URL ?? LOCAL.url;
const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? LOCAL.anonKey;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? LOCAL.serviceRoleKey;
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

async function makeOrgWithUser() {
  const { data: org } = await admin.from("organizations").insert({ nombre: `Org ${rnd()}` }).select("id").single();
  const { data: ticket } = await admin.from("signup_tickets").insert({ organization_id: org.id }).select("id").single();
  const email = `u-${rnd()}@example.org`;
  const { data: userData, error } = await admin.auth.admin.createUser({
    email, password: "TestPassword123!", email_confirm: true,
    user_metadata: { nombre: "Test User", signup_ticket: ticket.id },
  });
  if (error) throw error;
  const anon = createClient(URL, ANON_KEY);
  const { data: session } = await anon.auth.signInWithPassword({ email, password: "TestPassword123!" });
  const asUser = createClient(URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${session.session.access_token}` } },
  });
  // B1 (cupo por org, 20260907000000): estos tests ejercen el ciclo del
  // worker, no el cupo — se sube para no interferir. Cupo: p2-b1-b2-concurrencia.
  await admin.from("ai_org_policy").upsert({ organization_id: org.id, max_concurrent_jobs: 100 });
  return { orgId: org.id, userId: userData.user.id, asUser };
}

function invokeWorker() {
  return fetch(`${FUNCTIONS_URL}/job-worker`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
  });
}

async function crearJob(org, tipo, input = {}, extra = {}) {
  const { data, error } = await org.asUser.rpc("crear_job", { p_tipo: tipo, p_input: input, ...extra });
  if (error) throw new Error(`crear_job(${tipo}): ${error.message}`);
  return data;
}
const estado = async (id) => (await admin.from("jobs").select("*").eq("id", id).single()).data;

async function esperarEstado(id, estados, timeoutMs = 8000) {
  const objetivo = Array.isArray(estados) ? estados : [estados];
  const hasta = Date.now() + timeoutMs;
  while (Date.now() < hasta) {
    const j = await estado(id);
    if (objetivo.includes(j.estado)) return j;
    await sleep(150);
  }
  return estado(id);
}

async function main() {
  // --- auth ---
  // Nota: el edge runtime local, cuando recibe `apikey: <service secret>`,
  // sintetiza un Authorization: Bearer <service_role_key> y lo reenvía a la
  // función. Por eso las pruebas negativas usan la apikey pública (anon):
  // el runtime deja pasar la request pero estaAutorizadoWorker() la rechaza
  // porque el bearer no coincide con ningún secreto válido. En producción
  // el worker se despliega con verify_jwt=false (incremento A3) y
  // estaAutorizadoWorker() es la única puerta.
  {
    const r1 = await fetch(`${FUNCTIONS_URL}/job-worker`, { method: "POST" });
    check("1. worker sin credencial alguna -> 401", r1.status === 401);
    const r2 = await fetch(`${FUNCTIONS_URL}/job-worker`, {
      method: "POST",
      headers: { Authorization: "Bearer secreto-invalido-pero-largo-1234567890", apikey: ANON_KEY },
    });
    check("2. worker con bearer que no es un secreto válido -> 401", r2.status === 401);
  }

  // --- cola vacía ---
  {
    const r = await invokeWorker();
    const body = await r.json();
    check("3. cola vacía -> ok, sin jobs reclamados", r.status === 200 && body.ok === true && typeof body.resumen.reclamados === "number");
  }

  const org = await makeOrgWithUser();

  // --- N jobs noop "ok" -> todos COMPLETED ---
  {
    const ids = [];
    for (let i = 0; i < 6; i++) ids.push((await crearJob(org, "noop", { modo: "ok" })).id);
    await invokeWorker().then((r) => r.json());
    const finales = await Promise.all(ids.map((id) => esperarEstado(id, ["COMPLETED", "FAILED"])));
    check("4. los 6 jobs noop llegan a COMPLETED", finales.every((j) => j.estado === "COMPLETED"));
    check("5. cada job COMPLETED tiene progreso=100 y result_ref", finales.every((j) => j.progreso === 100 && j.result_ref?.ok === true));
    check("6. cada job se ejecutó una sola vez (intentos=1)", finales.every((j) => j.intentos === 1));
  }

  // --- falla_una_vez: RETRYING y luego COMPLETED ---
  {
    const j = await crearJob(org, "noop", { modo: "falla_una_vez" });
    await invokeWorker().then((r) => r.json());
    const tras1 = await esperarEstado(j.id, ["RETRYING", "FAILED"]);
    check("7. falla_una_vez -> RETRYING tras el primer intento", tras1.estado === "RETRYING");
    await admin.from("jobs").update({ next_attempt_at: new Date(Date.now() - 1000).toISOString() }).eq("id", j.id);
    await invokeWorker().then((r) => r.json());
    const tras2 = await esperarEstado(j.id, ["COMPLETED", "FAILED"]);
    check("8. falla_una_vez -> COMPLETED en el segundo intento (intentos=2)", tras2.estado === "COMPLETED" && tras2.intentos === 2);
  }

  // --- falla_fatal: FAILED sin reintento + dead letter ---
  {
    const j = await crearJob(org, "noop", { modo: "falla_fatal" }, { p_max_intentos: 5 });
    await invokeWorker().then((r) => r.json());
    const f = await esperarEstado(j.id, ["FAILED", "RETRYING", "COMPLETED"]);
    check("9. falla_fatal (ErrorNoReintentable) -> FAILED sin reintentar (intentos=1)", f.estado === "FAILED" && f.intentos === 1);
    const { data: dl } = await admin.from("jobs_dead_letter").select("motivo").eq("job_id", j.id);
    check("10. el job fatal se copió a dead letter con motivo error_no_reintentable", dl?.[0]?.motivo === "error_no_reintentable");
  }

  // --- falla siempre con max_intentos=2 -> FAILED tras agotar ---
  {
    const j = await crearJob(org, "noop", { modo: "falla" }, { p_max_intentos: 2 });
    for (let i = 0; i < 3; i++) {
      await invokeWorker().then((r) => r.json());
      await admin.from("jobs").update({ next_attempt_at: new Date(Date.now() - 1000).toISOString() }).eq("id", j.id);
      await sleep(200);
    }
    const f = await esperarEstado(j.id, ["FAILED"]);
    check("11. 'falla' con max_intentos=2 termina en FAILED", f.estado === "FAILED" && f.intentos === 2);
  }

  // --- multi_step ---
  {
    const j = await crearJob(org, "noop", { modo: "multi_step", steps: 3 });
    await invokeWorker().then((r) => r.json());
    const f = await esperarEstado(j.id, ["COMPLETED", "FAILED"], 10000);
    check("12. multi_step (3 pasos) llega a COMPLETED", f.estado === "COMPLETED");
    check("13. el resultado registra los 3 pasos ejecutados en orden", JSON.stringify(f.result_ref?.pasos) === JSON.stringify([0, 1, 2]));
  }

  // --- cancelación cooperativa mientras corre ---
  {
    const j = await crearJob(org, "noop", { modo: "cancelable" });
    const worker = invokeWorker().then((r) => r.json());
    await sleep(500);
    await org.asUser.rpc("cancelar_job", { p_job_id: j.id }); // marca cancel_solicitada
    await worker;
    const f = await esperarEstado(j.id, ["CANCELLED", "COMPLETED"]);
    check("14. un job en ejecución se cancela cooperativamente -> CANCELLED", f.estado === "CANCELLED");
  }

  // --- cancelación antes de arrancar ---
  {
    const j = await crearJob(org, "noop", { modo: "lento", ms: 500 });
    await admin.from("jobs").update({ cancel_solicitada: true }).eq("id", j.id);
    await invokeWorker().then((r) => r.json());
    const f = await esperarEstado(j.id, ["CANCELLED", "COMPLETED"]);
    check("15. un job con cancel_solicitada no se ejecuta -> CANCELLED", f.estado === "CANCELLED");
  }

  // --- sin doble procesamiento bajo invocaciones concurrentes ---
  {
    const ids = [];
    for (let i = 0; i < 12; i++) ids.push((await crearJob(org, "noop", { modo: "lento", ms: 120 })).id);
    await Promise.all([invokeWorker(), invokeWorker(), invokeWorker()].map((p) => p.then((r) => r.json())));
    const finales = await Promise.all(ids.map((id) => esperarEstado(id, ["COMPLETED", "FAILED"], 12000)));
    check("16. los 12 jobs se completan bajo 3 workers concurrentes", finales.every((j) => j.estado === "COMPLETED"));
    check("17. ningún job se procesó dos veces (todos intentos=1)", finales.every((j) => j.intentos === 1),
      `intentos: ${finales.map((j) => j.intentos).join(",")}`);
  }

  // limpieza
  try {
    await admin.from("jobs").delete().eq("organization_id", org.orgId);
    await admin.from("jobs_dead_letter").delete().eq("organization_id", org.orgId);
    await admin.auth.admin.deleteUser(org.userId);
    await admin.from("organizations").delete().eq("id", org.orgId);
  } catch { /* best-effort */ }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
