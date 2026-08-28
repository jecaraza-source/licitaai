// P2 · J — prueba de aceptación bajo carga (local, sin infra permanente).
//
// Ejercita la ruta cola → worker → RLS con carga concurrente multi-org:
//   - N organizaciones crean M jobs cada una, en paralelo
//   - K invocaciones concurrentes del worker (simula varios ticks de Vercel
//     Cron / varias instancias) drenando la cola
//   - mide latencia de creación (p50/p95/p99), throughput del worker y
//     tiempo-a-completar
//   - verifica: cero doble-procesamiento (FOR UPDATE SKIP LOCKED),
//     aislamiento entre organizaciones bajo carga, idempotencia,
//     cancelación cooperativa, y que la cola queda vacía
//
// Usa el tipo `noop` (determinista, sin IA) para que sea reproducible en
// CI y en local sin API keys. Para carga de IA real, ver README.md.
//
//   npx supabase start   (+ docker restart del edge runtime si hace falta)
//   CARGA_ORGS=10 CARGA_JOBS_POR_ORG=20 CARGA_WORKERS=3 \
//     node tests/load/carga-local.mjs
import { createClient } from "@supabase/supabase-js";
import { LOCAL } from "../helpers/local-supabase.mjs";

const URL = process.env.SUPABASE_URL ?? LOCAL.url;
const ANON = process.env.SUPABASE_ANON_KEY ?? LOCAL.anonKey;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? LOCAL.serviceRoleKey;
const FUNCTIONS = `${URL}/functions/v1`;

if (URL.includes("supabase.co")) {
  console.error("Rechazo correr contra un proyecto remoto — solo local.");
  process.exit(1);
}

const ORGS = Number(process.env.CARGA_ORGS ?? "10");
const JOBS_POR_ORG = Number(process.env.CARGA_JOBS_POR_ORG ?? "20");
const WORKERS = Number(process.env.CARGA_WORKERS ?? "3");
// Peticiones en vuelo por organización. El Postgres local no tiene pooler
// (supavisor excluido en este entorno); en prod PgBouncer absorbe esto.
// Un cliente real tampoco dispara 25 requests en paralelo.
const REQ_EN_VUELO = Number(process.env.CARGA_REQ_EN_VUELO ?? "4");
const TOTAL = ORGS * JOBS_POR_ORG;

const admin = createClient(URL, SERVICE);
const rnd = () => Math.random().toString(36).slice(2, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (arr, p) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};

let problemas = 0;
const check = (ok, msg) => {
  console.log(`${ok ? "  ✓" : "  ✗"} ${msg}`);
  if (!ok) problemas++;
};

async function crearOrg() {
  const { data: org } = await admin.from("organizations").insert({ nombre: `Carga ${rnd()}` }).select("id").single();
  const { data: ticket } = await admin.from("signup_tickets").insert({ organization_id: org.id }).select("id").single();
  const email = `carga-${rnd()}@example.org`;
  await admin.auth.admin.createUser({
    email, password: "TestPassword123!", email_confirm: true,
    user_metadata: { nombre: "Carga", signup_ticket: ticket.id },
  });
  const anon = createClient(URL, ANON);
  const { data: sess } = await anon.auth.signInWithPassword({ email, password: "TestPassword123!" });
  const asUser = createClient(URL, ANON, {
    global: { headers: { Authorization: `Bearer ${sess.session.access_token}` } },
  });
  return { orgId: org.id, asUser };
}

const invokeWorker = () =>
  fetch(`${FUNCTIONS}/job-worker`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SERVICE}`, apikey: SERVICE },
  }).then((r) => r.json()).catch((e) => ({ error: String(e) }));

async function main() {
  console.log(`\n== P2·J — carga local ==`);
  console.log(`orgs=${ORGS} jobs/org=${JOBS_POR_ORG} total=${TOTAL} workers_concurrentes=${WORKERS}\n`);

  // cola limpia
  await admin.from("jobs").delete().in("estado", ["PENDING", "AUTHORIZED", "RETRYING", "RUNNING"]);

  console.log("preparando organizaciones…");
  const orgs = await Promise.all(Array.from({ length: ORGS }, crearOrg));

  // --- fase 1: creación concurrente ---
  console.log("creando jobs (concurrente)…");
  const t0 = Date.now();
  const latencias = [];
  const jobsPorOrg = new Map();
  let erroresCreacion = 0;

  const primerError = { msg: null };
  await Promise.all(orgs.map(async ({ orgId, asUser }) => {
    const mios = [];
    let cursor = 0;
    async function worker() {
      while (cursor < JOBS_POR_ORG) {
        const i = cursor++;
        const ini = performance.now();
        const { data, error } = await asUser.rpc("crear_job", {
          p_tipo: "noop", p_recurso_tipo: null, p_recurso_id: null,
          p_input: { ms: 0 }, p_idempotency_key: `carga:${orgId}:${i}`,
          p_prioridad: 100, p_dedup_hash: null, p_max_intentos: 3, p_reserva_id: null,
        });
        latencias.push(performance.now() - ini);
        if (error || !data) {
          erroresCreacion++;
          if (!primerError.msg) primerError.msg = error?.message ?? "sin data";
          continue;
        }
        mios.push(data.id);
      }
    }
    await Promise.all(Array.from({ length: REQ_EN_VUELO }, worker));
    jobsPorOrg.set(orgId, mios);
  }));
  const tCreacion = Date.now() - t0;

  const creados = [...jobsPorOrg.values()].flat();
  check(erroresCreacion === 0, `creación sin errores (${erroresCreacion} fallos${primerError.msg ? `: ${primerError.msg}` : ""})`);
  check(creados.length === TOTAL, `${creados.length}/${TOTAL} jobs creados`);
  console.log(`  creación: ${tCreacion} ms · p50 ${pct(latencias, 50).toFixed(0)} · p95 ${pct(latencias, 95).toFixed(0)} · p99 ${pct(latencias, 99).toFixed(0)} ms/job`);

  // --- fase 2: aislamiento bajo carga ---
  const [a, b] = orgs;
  const { data: cruzado } = await a.asUser.from("jobs").select("id").eq("organization_id", b.orgId);
  check((cruzado ?? []).length === 0, "org A no ve jobs de org B bajo carga (RLS)");

  // --- fase 3: idempotencia bajo carga ---
  {
    const { data: dup } = await a.asUser.rpc("crear_job", {
      p_tipo: "noop", p_recurso_tipo: null, p_recurso_id: null, p_input: {},
      p_idempotency_key: `carga:${a.orgId}:0`, p_prioridad: 100,
      p_dedup_hash: null, p_max_intentos: 3, p_reserva_id: null,
    });
    check(jobsPorOrg.get(a.orgId).includes(dup?.id), "idempotency_key repetida devuelve el job existente");
  }

  // --- fase 4: cancelación de una muestra antes de que arranque ---
  const aCancelar = creados.filter((_, i) => i % 37 === 0).slice(0, 5);
  for (const id of aCancelar) {
    const org = orgs.find(({ orgId }) => jobsPorOrg.get(orgId).includes(id));
    await org.asUser.rpc("cancelar_job", { p_job_id: id });
  }

  // --- fase 5: drenar la cola con K workers concurrentes ---
  const orgIds = orgs.map((o) => o.orgId);
  console.log(`drenando la cola con ${WORKERS} workers concurrentes…`);
  const tDrenaje = Date.now();
  let ticks = 0;
  for (let iter = 0; iter < 400; iter++) {
    await Promise.all(Array.from({ length: WORKERS }, invokeWorker));
    ticks += WORKERS;
    const { count: pendientes } = await admin
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .in("estado", ["PENDING", "AUTHORIZED", "RETRYING", "RUNNING"])
      .in("organization_id", orgIds);
    if ((pendientes ?? 0) === 0) break;
    await sleep(150);
  }
  const tTotal = Date.now() - tDrenaje;

  // --- fase 6: verificación final ---
  const { data: finales } = await admin
    .from("jobs")
    .select("id, estado, intentos, worker_id, organization_id, started_at, finished_at")
    .in("organization_id", orgIds);

  const completados = finales.filter((j) => j.estado === "COMPLETED");
  const cancelados = finales.filter((j) => j.estado === "CANCELLED");
  const otros = finales.filter((j) => !["COMPLETED", "CANCELLED"].includes(j.estado));
  const dobleProc = completados.filter((j) => j.intentos > 1);

  check(otros.length === 0, `cola drenada: 0 jobs sin terminar (${otros.length} colgados)`);
  check(cancelados.length === aCancelar.length, `los ${aCancelar.length} cancelados quedaron CANCELLED (${cancelados.length})`);
  check(dobleProc.length === 0, `cero doble-procesamiento (${dobleProc.length} con intentos>1 tras COMPLETED)`);

  const duraciones = completados
    .filter((j) => j.started_at && j.finished_at)
    .map((j) => new Date(j.finished_at).getTime() - new Date(j.started_at).getTime());
  const throughput = (completados.length / (tTotal / 1000)).toFixed(1);

  console.log(`\n== resultados ==`);
  console.log(`  jobs completados:      ${completados.length}`);
  console.log(`  jobs cancelados:       ${cancelados.length}`);
  console.log(`  drenaje:               ${tTotal} ms (${ticks} invocaciones de worker)`);
  console.log(`  throughput:            ${throughput} jobs/s`);
  console.log(`  duración de job p50/p95: ${pct(duraciones, 50)} / ${pct(duraciones, 95)} ms`);
  console.log(`  creación p95:          ${pct(latencias, 95).toFixed(0)} ms`);

  // limpieza best-effort
  await admin.from("jobs").delete().in("organization_id", orgIds);

  console.log(`\n${problemas === 0 ? "ACEPTACIÓN OK" : `ACEPTACIÓN CON ${problemas} PROBLEMA(S)`}`);
  process.exit(problemas === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
