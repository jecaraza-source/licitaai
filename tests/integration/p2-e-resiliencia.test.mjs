// P2 · E2/E3 — integration: circuit breakers (provider_health) + el
// comportamiento del worker cuando un circuito está abierto.
//
//   npx supabase start   (o stop/start si el edge runtime no recogió los cambios)
//   node tests/integration/p2-e-resiliencia.test.mjs
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
const invokeWorker = () => fetch(`${FUNCTIONS_URL}/job-worker`, {
  method: "POST", headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
});
const cbRow = async (p) => (await admin.from("provider_health").select("*").eq("provider", p).single()).data;

async function main() {
  const P = `test-${rnd()}`;

  // 1. cb_estado default CLOSED (auto-crea la fila).
  {
    const { data } = await admin.rpc("cb_estado", { p_provider: P });
    check("1. cb_estado de un proveedor nuevo -> CLOSED", data === "CLOSED");
    check("2. se creó la fila en provider_health", !!(await cbRow(P)));
  }

  // 2. 5 fallos consecutivos (umbral 5) -> OPEN.
  {
    let estado;
    for (let i = 0; i < 5; i++) {
      const { data } = await admin.rpc("cb_registrar_fallo", { p_provider: P, p_umbral: 5, p_abierto_segundos: 60 });
      estado = data;
    }
    check("3. tras 5 fallos el circuito abre (OPEN)", estado === "OPEN");
    const row = await cbRow(P);
    check("4. abierto_hasta quedó en el futuro", new Date(row.abierto_hasta) > new Date());
    const { data: efectivo } = await admin.rpc("cb_estado", { p_provider: P });
    check("5. cb_estado devuelve OPEN mientras abierto_hasta no vence", efectivo === "OPEN");
  }

  // 3. Pasado abierto_hasta -> HALF_OPEN (y persiste).
  {
    await admin.from("provider_health").update({ abierto_hasta: new Date(Date.now() - 1000).toISOString() }).eq("provider", P);
    const { data } = await admin.rpc("cb_estado", { p_provider: P });
    check("6. pasado abierto_hasta, cb_estado -> HALF_OPEN", data === "HALF_OPEN");
    check("7. el estado HALF_OPEN se persistió", (await cbRow(P)).estado === "HALF_OPEN");
  }

  // 4. Un fallo en HALF_OPEN -> OPEN de nuevo.
  {
    const { data } = await admin.rpc("cb_registrar_fallo", { p_provider: P, p_umbral: 5, p_abierto_segundos: 60 });
    check("8. un fallo en HALF_OPEN reabre el circuito", data === "OPEN");
  }

  // 5. cb_registrar_exito -> CLOSED, contador a 0.
  {
    await admin.rpc("cb_registrar_exito", { p_provider: P });
    const row = await cbRow(P);
    check("9. cb_registrar_exito -> CLOSED y fallos_consecutivos = 0", row.estado === "CLOSED" && row.fallos_consecutivos === 0);
  }

  // 6. reencolar_por_espera revierte el incremento de intentos.
  {
    const org = await makeOrgWithUser();
    const { data: job } = await admin.from("jobs").insert({
      organization_id: org.orgId, requested_by: org.userId, tipo: "noop", estado: "RUNNING",
      intentos: 2, lease_expires_at: new Date().toISOString(),
    }).select("id").single();
    await admin.rpc("reencolar_por_espera", { p_job_id: job.id, p_segundos: 90 });
    const { data: after } = await admin.from("jobs").select("estado, intentos, next_attempt_at").eq("id", job.id).single();
    check("10. reencolar_por_espera -> RETRYING, intentos revertido (2->1), next_attempt_at futuro",
      after.estado === "RETRYING" && after.intentos === 1 && new Date(after.next_attempt_at) > new Date());
    await admin.from("jobs").delete().eq("organization_id", org.orgId);
    await admin.auth.admin.deleteUser(org.userId);
    await admin.from("organizations").delete().eq("id", org.orgId);
  }

  // 7. RLS de provider_health.
  {
    const org = await makeOrgWithUser();
    const { data: leible } = await org.asUser.from("provider_health").select("provider").eq("provider", "anthropic");
    check("11. provider_health es legible por un usuario autenticado", (leible ?? []).length === 1);
    const { error } = await org.asUser.from("provider_health").update({ estado: "OPEN" }).eq("provider", "anthropic").select();
    check("12. un usuario no puede escribir provider_health (RLS)", !error && true); // update filtra a 0 filas
    const { data: sigueCerrado } = await admin.from("provider_health").select("estado").eq("provider", "anthropic").single();
    check("13. anthropic sigue CLOSED tras el intento de UPDATE", sigueCerrado.estado === "CLOSED");
    await admin.auth.admin.deleteUser(org.userId);
    await admin.from("organizations").delete().eq("id", org.orgId);
  }

  // 8. Worker + circuito abierto: el job noop-ef espera, no falla.
  {
    await admin.from("feature_flags").update({ enabled: true }).eq("key", "resiliencia.circuit_breaker");
    await admin.rpc("cb_registrar_exito", { p_provider: "anthropic" });
    // abrir el circuito de anthropic a mano
    await admin.from("provider_health").update({
      estado: "OPEN", abierto_hasta: new Date(Date.now() + 120000).toISOString(), fallos_consecutivos: 5,
    }).eq("provider", "anthropic");
    await sleep(4000); // TTL de la caché de flags

    const org = await makeOrgWithUser();
    const { data: lic } = await admin.from("licitaciones").insert({
      organization_id: org.orgId, numero_expediente: `E-${rnd()}`, titulo: "L", institucion: "I",
      tipo: "SERVICIOS", estado_id: "FEDERAL", sistema: "COMPRANET",
    }).select("id").single();
    const { data: job } = await admin.from("jobs").insert({
      organization_id: org.orgId, requested_by: org.userId, tipo: "noop-ef", estado: "AUTHORIZED",
      recurso_tipo: "licitacion", recurso_id: lic.id, input_json: { licitacion_id: lic.id },
    }).select("id").single();

    await invokeWorker().then((r) => r.json());
    await sleep(600);
    const { data: after } = await admin.from("jobs").select("estado, intentos, next_attempt_at, error_seguro").eq("id", job.id).single();
    check("14. con el circuito de anthropic abierto, el job noop-ef queda RETRYING (no FAILED)", after.estado === "RETRYING", `${after.estado}`);
    check("15. no consumió presupuesto de reintentos (intentos = 0)", after.intentos === 0, `intentos=${after.intentos}`);
    check("16. next_attempt_at está lejos (espera del circuito, > 30s)", new Date(after.next_attempt_at).getTime() - Date.now() > 30000);

    // limpieza
    await admin.from("provider_health").update({ estado: "CLOSED", abierto_hasta: null, fallos_consecutivos: 0 }).eq("provider", "anthropic");
    await admin.from("feature_flags").update({ enabled: false }).eq("key", "resiliencia.circuit_breaker");
    await admin.from("jobs").delete().eq("organization_id", org.orgId);
    await admin.auth.admin.deleteUser(org.userId);
    await admin.from("organizations").delete().eq("id", org.orgId);
  }

  await admin.from("provider_health").delete().eq("provider", P);
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch(async (e) => {
  try {
    await admin.from("feature_flags").update({ enabled: false }).eq("key", "resiliencia.circuit_breaker");
    await admin.from("provider_health").update({ estado: "CLOSED", abierto_hasta: null, fallos_consecutivos: 0 }).eq("provider", "anthropic");
  } catch { /* ignore */ }
  console.error(e);
  process.exit(1);
});
