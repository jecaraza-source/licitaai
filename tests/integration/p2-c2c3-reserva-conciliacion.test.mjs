// P2 · C2/C3 — integration: reserva de presupuesto en la creación del job
// y conciliación/liberación por el worker (ADR 0004).
//
//   npx supabase start   (o stop/start si el edge runtime no recogió los cambios)
//   node tests/integration/p2-c2c3-reserva-conciliacion.test.mjs
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
const near = (a, b, eps = 1e-6) => Math.abs(Number(a) - Number(b)) < eps;

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

const invokeWorker = () =>
  fetch(`${FUNCTIONS_URL}/job-worker`, { method: "POST", headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY } });

const gasto = async (orgId) => {
  const { data } = await admin.from("ai_budget_ledger").select("estado, monto_usd").eq("organization_id", orgId);
  return (data ?? []).reduce((s, r) => s + (["RESERVADO", "CONSUMIDO"].includes(r.estado) ? 1 : -1) * Number(r.monto_usd), 0);
};
const jobRow = async (id) => (await admin.from("jobs").select("*").eq("id", id).single()).data;

async function correrHasta(jobId, estados, maxTicks = 8) {
  const objetivo = Array.isArray(estados) ? estados : [estados];
  for (let i = 0; i < maxTicks; i++) {
    await invokeWorker().then((r) => r.json());
    await sleep(400);
    const j = await jobRow(jobId);
    if (objetivo.includes(j.estado)) return j;
    if (j.next_attempt_at) await admin.from("jobs").update({ next_attempt_at: new Date(Date.now() - 1000).toISOString() }).eq("id", jobId);
  }
  return jobRow(jobId);
}

async function main() {
  // Activar el flag de gobierno de costo (global; se apaga al final).
  await admin.from("feature_flags").update({ enabled: true }).eq("key", "ai.gobierno_costo");
  await sleep(200);

  const org = await makeOrgWithUser();

  // --- C2: reserva en la creación del job (vía crearJobConPresupuesto) ---
  // Simulamos lo que hace la ruta: reservar_presupuesto_ia + crear_job(p_reserva_id).
  let jobConReserva;
  {
    const { data: usd } = await org.asUser.rpc("estimar_costo_ia", { p_modelo: "claude-sonnet-5", p_tokens_input: 25000, p_tokens_output: 4000 });
    const { data: reservaId, error: eRes } = await org.asUser.rpc("reservar_presupuesto_ia", { p_tipo: "analizar-bases", p_estimado_usd: usd });
    check("1. reservar_presupuesto_ia (analizar-bases) devuelve reserva_id", !eRes && typeof reservaId === "string", eRes?.message);

    const { data: job, error: eJob } = await org.asUser.rpc("crear_job", {
      p_tipo: "noop", p_input: { modo: "ok", tok_in: 25000, tok_out: 4000, modelo: "claude-sonnet-5" },
      p_reserva_id: reservaId,
    });
    jobConReserva = job;
    check("2. crear_job almacena el reserva_id en el job", !eJob && job?.reserva_id === reservaId, eJob?.message);
    check("3. el ledger tiene la fila RESERVADO", near(await gasto(org.orgId), Number(usd)), `${await gasto(org.orgId)} vs ${usd}`);
  }

  // --- C3: el worker concilia al COMPLETAR ---
  {
    const final = await correrHasta(jobConReserva.id, ["COMPLETED", "FAILED"]);
    check("4. el job con reserva llega a COMPLETED", final.estado === "COMPLETED", `${final.estado}/${final.error_seguro}`);
    // costo real de sonnet 25000/4000 = 0.05 + 0.04 = 0.09
    check("5. tras conciliar, el gasto neto = costo real (0.09), no el estimado", near(await gasto(org.orgId), 0.09), String(await gasto(org.orgId)));
    const { data: filas } = await admin.from("ai_budget_ledger").select("estado").eq("reserva_id", jobConReserva.reserva_id);
    const estados = (filas ?? []).map((f) => f.estado).sort();
    check("6. el ledger de la reserva tiene RESERVADO + CONSUMIDO + LIBERADO", JSON.stringify(estados) === JSON.stringify(["CONSUMIDO", "LIBERADO", "RESERVADO"]), JSON.stringify(estados));
  }

  // --- C3: liberación total si el job FALLA sin producir tokens ---
  {
    const orgF = await makeOrgWithUser();
    const { data: reservaId } = await orgF.asUser.rpc("reservar_presupuesto_ia", { p_tipo: "analizar-bases", p_estimado_usd: 0.8 });
    const { data: job } = await orgF.asUser.rpc("crear_job", {
      p_tipo: "noop", p_input: { modo: "falla_fatal" }, p_reserva_id: reservaId, p_max_intentos: 1,
    });
    const final = await correrHasta(job.id, ["FAILED", "COMPLETED"]);
    check("7. el job fatal con reserva llega a FAILED", final.estado === "FAILED");
    check("8. la reserva se liberó por completo (gasto neto 0)", near(await gasto(orgF.orgId), 0), String(await gasto(orgF.orgId)));

    await admin.from("ai_budget_ledger").delete().eq("organization_id", orgF.orgId);
    await admin.auth.admin.deleteUser(orgF.userId);
    await admin.from("organizations").delete().eq("id", orgF.orgId);
  }

  // --- C2: presupuesto agotado -> reservar falla (la ruta devolvería 429) ---
  {
    const orgB = await makeOrgWithUser();
    await admin.from("ai_org_policy").upsert({ organization_id: orgB.orgId, cuota_mensual_usd: 0.01 });
    const { data: usd } = await orgB.asUser.rpc("estimar_costo_ia", { p_modelo: "claude-sonnet-5", p_tokens_input: 25000, p_tokens_output: 4000 });
    const { error } = await orgB.asUser.rpc("reservar_presupuesto_ia", { p_tipo: "analizar-bases", p_estimado_usd: usd });
    check("9. con la cuota mensual agotada, reservar_presupuesto_ia falla con hint cuota_mensual", !!error && (error.hint ?? "").includes("cuota_mensual"), JSON.stringify(error));

    await admin.auth.admin.deleteUser(orgB.userId);
    await admin.from("organizations").delete().eq("id", orgB.orgId);
  }

  // --- C3: worker sin reserva no rompe (flag apagado / job viejo) ---
  {
    const { data: job } = await org.asUser.rpc("crear_job", { p_tipo: "noop", p_input: { modo: "ok" } });
    // este crear_job directo no lleva reserva_id
    const final = await correrHasta(job.id, ["COMPLETED", "FAILED"]);
    check("10. un job sin reserva_id se procesa normal (COMPLETED)", final.estado === "COMPLETED");
  }

  // limpieza
  try {
    await admin.from("feature_flags").update({ enabled: false }).eq("key", "ai.gobierno_costo");
    await admin.from("jobs").delete().eq("organization_id", org.orgId);
    await admin.from("ai_budget_ledger").delete().eq("organization_id", org.orgId);
    await admin.auth.admin.deleteUser(org.userId);
    await admin.from("organizations").delete().eq("id", org.orgId);
  } catch { /* best-effort */ }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch(async (e) => {
  await admin.from("feature_flags").update({ enabled: false }).eq("key", "ai.gobierno_costo").catch(() => {});
  console.error(e);
  process.exit(1);
});
