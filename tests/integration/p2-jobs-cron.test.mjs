// P2 · A3 — integration tests para los disparadores del worker
// (migración 20260827003000_p2_jobs_cron.sql).
//
// El disparo HTTP end-to-end (Vercel Cron -> ruta -> worker) se cubre en el
// smoke test de Fase G; aquí se prueban las piezas del lado de Postgres.
//
// Usage:
//   npx supabase start
//   node tests/integration/p2-jobs-cron.test.mjs
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

async function main() {
  // 1. pg_cron programó el barrido de expirados.
  {
    const { data, error } = await admin.rpc("cron_job_existe", { p_jobname: "p2-expirar-jobs" });
    check("1. pg_cron tiene programado p2-expirar-jobs", data === true, error?.message);
  }
  {
    const { data } = await admin.rpc("cron_job_existe", { p_jobname: "p2-job-worker-tick" });
    check("2. el tick HTTP de 10s NO está programado por defecto (se activa por entorno)", data === false);
  }

  // 3. app_settings bloqueada para usuarios.
  {
    const { data: org } = await admin.from("organizations").insert({ nombre: `Org ${rnd()}` }).select("id").single();
    const { data: ticket } = await admin.from("signup_tickets").insert({ organization_id: org.id }).select("id").single();
    const email = `u-${rnd()}@example.org`;
    const { data: u } = await admin.auth.admin.createUser({
      email, password: "TestPassword123!", email_confirm: true,
      user_metadata: { nombre: "T", signup_ticket: ticket.id },
    });
    const anon = createClient(URL, ANON_KEY);
    const { data: session } = await anon.auth.signInWithPassword({ email, password: "TestPassword123!" });
    const asUser = createClient(URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${session.session.access_token}` } },
    });

    const { data: rows } = await asUser.from("app_settings").select("key");
    check("3. un usuario autenticado no puede leer app_settings", (rows ?? []).length === 0);
    const { error: insErr } = await asUser.from("app_settings").insert({ key: `k-${rnd()}`, value: "x" });
    check("4. un usuario autenticado no puede escribir app_settings", !!insErr);

    try {
      await admin.auth.admin.deleteUser(u.user.id);
      await admin.from("organizations").delete().eq("id", org.id);
    } catch { /* best-effort */ }
  }

  // 5. disparar_worker() es un no-op silencioso sin config cargada.
  {
    await admin.from("app_settings").delete().in("key", ["worker_url", "worker_secret"]);
    const { error } = await admin.rpc("disparar_worker");
    check("5. disparar_worker() no falla sin app_settings (no-op seguro)", !error, error?.message);
  }

  // 6. expirar_jobs (lo que corre el cron) devuelve un entero sin fallar.
  {
    const { data, error } = await admin.rpc("expirar_jobs");
    check("6. expirar_jobs() ejecuta y devuelve un conteo", !error && typeof data === "number", error?.message);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
