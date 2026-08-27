// P2 · A5 — integration tests para Realtime sobre public.jobs
// (migración 20260827005000). Prueba el canal que consume useJob/<JobStatus>.
//
// Usage:
//   npx supabase start
//   node tests/integration/p2-jobs-realtime.test.mjs
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";

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

async function makeOrgWithSignedInClient() {
  const { data: org } = await admin.from("organizations").insert({ nombre: `Org ${rnd()}` }).select("id").single();
  const { data: ticket } = await admin.from("signup_tickets").insert({ organization_id: org.id }).select("id").single();
  const email = `u-${rnd()}@example.org`;
  const { data: userData } = await admin.auth.admin.createUser({
    email, password: "TestPassword123!", email_confirm: true,
    user_metadata: { nombre: "T", signup_ticket: ticket.id },
  });
  const client = createClient(URL, ANON_KEY, { realtime: { heartbeatIntervalMs: 5000 } });
  const { data: sess } = await client.auth.signInWithPassword({ email, password: "TestPassword123!" });
  // Realtime usa un websocket aparte — hay que pasarle el token del usuario
  // para que postgres_changes aplique la RLS con su identidad.
  await client.realtime.setAuth(sess.session.access_token);
  return { orgId: org.id, userId: userData.user.id, client };
}

function suscribir(client, jobId) {
  const eventos = [];
  const channel = client
    .channel(`job-${jobId}-${rnd()}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "jobs", filter: `id=eq.${jobId}` },
      (payload) => { if (payload.new) eventos.push(payload.new); });
  return new Promise((resolve, reject) => {
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") resolve({ channel, eventos });
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") reject(new Error(status));
    });
  });
}

async function main() {
  // 1. jobs está en la publicación de Realtime.
  {
    const { data } = await admin.rpc("tabla_en_realtime", { p_tabla: "jobs" });
    check("1. public.jobs está en la publicación supabase_realtime", data === true);
  }

  const orgA = await makeOrgWithSignedInClient();
  const orgB = await makeOrgWithSignedInClient();

  // 2. El dueño recibe los UPDATE de progreso de su job.
  {
    const { data: jobRow } = await admin.from("jobs").insert({
      organization_id: orgA.orgId, requested_by: orgA.userId, tipo: "noop", estado: "RUNNING",
      lease_expires_at: new Date(Date.now() + 300000).toISOString(),
    }).select("id").single();

    const { channel, eventos } = await suscribir(orgA.client, jobRow.id);
    await sleep(300);

    await admin.rpc("progreso_job", { p_job_id: jobRow.id, p_progreso: 45, p_detalle: "a mitad" });
    await admin.rpc("completar_job", { p_job_id: jobRow.id, p_result_ref: { ok: true } });

    await sleep(1500);
    check("2. el dueño recibe eventos de UPDATE de su job", eventos.length >= 1, `${eventos.length} eventos`);
    check("3. el evento trae el progreso actualizado", eventos.some((e) => e.progreso === 45 && e.progreso_detalle === "a mitad"));
    check("4. el dueño recibe el evento de COMPLETED", eventos.some((e) => e.estado === "COMPLETED"));

    await orgA.client.removeChannel(channel);
    await admin.from("jobs").delete().eq("id", jobRow.id);
  }

  // 5. RLS: otra organización NO recibe los eventos.
  {
    const { data: jobRow } = await admin.from("jobs").insert({
      organization_id: orgA.orgId, requested_by: orgA.userId, tipo: "noop", estado: "RUNNING",
      lease_expires_at: new Date(Date.now() + 300000).toISOString(),
    }).select("id").single();

    const { channel, eventos } = await suscribir(orgB.client, jobRow.id);
    await sleep(300);
    await admin.rpc("progreso_job", { p_job_id: jobRow.id, p_progreso: 70 });
    await sleep(1500);

    check("5. una organización ajena no recibe eventos del job (RLS en Realtime)", eventos.length === 0, `${eventos.length} eventos filtrados`);

    await orgB.client.removeChannel(channel);
    await admin.from("jobs").delete().eq("id", jobRow.id);
  }

  // limpieza
  try {
    await orgA.client.removeAllChannels();
    await orgB.client.removeAllChannels();
    await admin.auth.admin.deleteUser(orgA.userId);
    await admin.auth.admin.deleteUser(orgB.userId);
    await admin.from("organizations").delete().in("id", [orgA.orgId, orgB.orgId]);
  } catch { /* best-effort */ }

  console.log(`\n${pass} passed, ${fail} failed`);
  // Realtime en local a veces tarda en propagar; dar un pequeño margen antes de salir.
  await sleep(200);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
