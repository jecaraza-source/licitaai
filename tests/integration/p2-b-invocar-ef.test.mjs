// P2 · Fase B — integration del wrapper handlerInvocaEF + authenticate({
// permitirJob: true }), a través de la Edge Function de prueba test-echo y
// el handler "noop-ef".
//
//   npx supabase start   (o stop/start si el edge runtime no recogió los cambios)
//   node tests/integration/p2-b-invocar-ef.test.mjs
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
  const { data: u } = await admin.auth.admin.createUser({
    email, password: "TestPassword123!", email_confirm: true,
    user_metadata: { nombre: "T", signup_ticket: ticket.id },
  });
  const anon = createClient(URL, ANON_KEY);
  const { data: sess } = await anon.auth.signInWithPassword({ email, password: "TestPassword123!" });
  const asUser = createClient(URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${sess.session.access_token}` } },
  });
  // B1 (cupo por org, 20260907000000): estos tests ejercen el ciclo del
  // worker, no el cupo — se sube para no interferir. Cupo: p2-b1-b2-concurrencia.
  await admin.from("ai_org_policy").upsert({ organization_id: org.id, max_concurrent_jobs: 100 });
  return { orgId: org.id, userId: u.user.id, asUser };
}
async function makeLic(orgId) {
  const { data } = await admin.from("licitaciones").insert({
    organization_id: orgId, numero_expediente: `E-${rnd()}`, titulo: "L", institucion: "I",
    tipo: "SERVICIOS", estado_id: "FEDERAL", sistema: "COMPRANET",
  }).select("id").single();
  return data.id;
}
const invokeWorker = () => fetch(`${FUNCTIONS_URL}/job-worker`, {
  method: "POST", headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
});
const jobRow = async (id) => (await admin.from("jobs").select("*").eq("id", id).single()).data;
async function correr(jobId, estados, ticks = 6) {
  const obj = Array.isArray(estados) ? estados : [estados];
  for (let i = 0; i < ticks; i++) {
    await invokeWorker().then((r) => r.json());
    await sleep(400);
    const j = await jobRow(jobId);
    if (obj.includes(j.estado)) return j;
    if (j.next_attempt_at) await admin.from("jobs").update({ next_attempt_at: new Date(Date.now() - 1000).toISOString() }).eq("id", jobId);
  }
  return jobRow(jobId);
}

async function main() {
  // --- authenticate({ permitirJob }): test-echo con service key + job_id ---
  const org = await makeOrgWithUser();
  const licId = await makeLic(org.orgId);

  {
    const { data: job } = await admin.from("jobs").insert({
      organization_id: org.orgId, requested_by: org.userId, tipo: "noop-ef", estado: "AUTHORIZED",
      recurso_tipo: "licitacion", recurso_id: licId,
      input_json: { licitacion_id: licId, tok_in: 5000, tok_out: 800 },
    }).select("id").single();

    // invocación directa como la haría el worker
    const r = await fetch(`${FUNCTIONS_URL}/test-echo`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ licitacion_id: licId, job_id: job.id }),
    });
    const body = await r.json();
    check("1. test-echo autoriza en modo job (service key + job_id) -> 200", r.status === 200 && body.ok === true);
    check("2. el contexto se derivó del job (organización correcta)", body.data.organizationId === org.orgId);

    const r2 = await fetch(`${FUNCTIONS_URL}/test-echo`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ licitacion_id: licId }), // sin job_id
    });
    check("3. test-echo sin job_id (y sin JWT de usuario) -> 401", r2.status === 401);
  }

  // --- el worker corre un job noop-ef de punta a punta ---
  {
    const { data: job } = await admin.from("jobs").insert({
      organization_id: org.orgId, requested_by: org.userId, tipo: "noop-ef", estado: "AUTHORIZED",
      recurso_tipo: "licitacion", recurso_id: licId,
      input_json: {
        licitacion_id: licId, tok_in: 12000, tok_out: 2000, nivel_confianza: "ALTO",
        _citas: [{ pagina: 3, seccion: "2.1", extracto: "x", score: 0.9 }],
      },
    }).select("id").single();

    const final = await correr(job.id, ["COMPLETED", "FAILED"]);
    check("4. el job noop-ef llega a COMPLETED", final.estado === "COMPLETED", `${final.estado}/${final.error_seguro}`);
    check("5. el worker guardó los tokens que reportó la EF (_usage)", final.tokens_input === 12000 && final.tokens_output === 2000);
    check("6. result_ref trae la data de la EF", final.result_ref?.echo?.licitacion_id === licId);

    // el worker registra el uso en ai_usage_log (la EF en modo job corre con
    // service_role y su registrarUsoIA con auth.uid() no puede escribir).
    const { data: usos } = await admin.from("ai_usage_log")
      .select("funcion, input_tokens, output_tokens")
      .eq("organization_id", org.orgId).eq("funcion", "test-echo");
    check("6b. el worker registró el uso de IA en ai_usage_log", (usos ?? []).some((u) => u.input_tokens === 12000 && u.output_tokens === 2000));
  }

  // --- versionado: con ai.versionado_resultados ON, se persiste en ai_results ---
  {
    await admin.from("feature_flags").update({ enabled: true }).eq("key", "ai.versionado_resultados");
    await sleep(4000); // TTL de la caché de flags en el edge runtime
    const { data: job } = await admin.from("jobs").insert({
      organization_id: org.orgId, requested_by: org.userId, tipo: "noop-ef", estado: "AUTHORIZED",
      recurso_tipo: "licitacion", recurso_id: licId,
      input_json: {
        licitacion_id: licId, nivel_confianza: "MEDIO",
        _citas: [{ pagina: 5, seccion: "3", extracto: "requisito", score: 0.7 }],
      },
    }).select("id").single();

    const final = await correr(job.id, ["COMPLETED", "FAILED"]);
    check("7. job noop-ef COMPLETED con versionado ON", final.estado === "COMPLETED");

    const { data: results } = await admin.from("ai_results")
      .select("id, tipo_analisis, nivel_confianza, prompt_template_id, job_id")
      .eq("recurso_id", licId).eq("tipo_analisis", "analisis_bases");
    check("8. se creó un ai_results para el job", (results ?? []).some((r) => r.job_id === job.id && r.nivel_confianza === "MEDIO" && r.prompt_template_id === "test-echo"));

    const rid = (results ?? []).find((r) => r.job_id === job.id)?.id;
    const { data: citas } = await admin.from("ai_result_citations").select("pagina").eq("ai_result_id", rid);
    check("9. se guardaron las citas del resultado", (citas ?? []).some((c) => c.pagina === 5));

    await admin.from("feature_flags").update({ enabled: false }).eq("key", "ai.versionado_resultados");
  }

  // limpieza
  try {
    await admin.from("feature_flags").update({ enabled: false }).eq("key", "ai.versionado_resultados");
    await admin.from("jobs").delete().eq("organization_id", org.orgId);
    await admin.from("ai_results").delete().eq("organization_id", org.orgId);
    await admin.auth.admin.deleteUser(org.userId);
    await admin.from("organizations").delete().eq("id", org.orgId);
  } catch { /* best-effort */ }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch(async (e) => {
  try {
    await admin.from("feature_flags").update({ enabled: false }).eq("key", "ai.versionado_resultados");
  } catch { /* ignore */ }
  console.error(e);
  process.exit(1);
});
