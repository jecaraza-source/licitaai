// P2 · A1 — integration tests para el sistema de jobs
// (supabase/migrations/20260827001000_p2_jobs.sql).
//
// Cubre: RLS (sin INSERT/UPDATE directo), crear_job (idempotencia,
// autorización de recurso, scoping por organización), cancelar_job, y el
// ciclo del worker (reclamar_jobs con FOR UPDATE SKIP LOCKED, progreso,
// completar, fallar con backoff + dead letter, reencolar step, expirar).
//
// Usage:
//   npx supabase start
//   node tests/integration/p2-jobs.test.mjs
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
  return { orgId: org.id, userId: userData.user.id, asUser };
}

async function makeLicitacion(orgId) {
  const { data } = await admin.from("licitaciones").insert({
    organization_id: orgId, numero_expediente: `EXP-${rnd()}`, titulo: "Lic prueba",
    institucion: "Inst", tipo: "SERVICIOS", estado_id: "FEDERAL", sistema: "COMPRANET",
  }).select("id").single();
  return data.id;
}

async function main() {
  // Aislamiento: limpiar jobs no terminales de corridas previas (en CI la
  // base arranca limpia; en local se acumulan y contaminan reclamar_jobs).
  await admin.from("jobs").delete().in("estado", ["PENDING", "AUTHORIZED", "RETRYING", "RUNNING"]);

  const orgA = await makeOrgWithUser();
  const orgB = await makeOrgWithUser();
  const licA = await makeLicitacion(orgA.orgId);
  const licB = await makeLicitacion(orgB.orgId);

  // El cupo de concurrencia por org (B1, migración 20260907000000) es 3 por
  // defecto. Estos tests ejercen el CICLO del worker, no el cupo — varios
  // subtests dejan jobs RUNNING en orgA que consumirían ese cupo y harían
  // que reclamos posteriores no tomen nada. Se sube el cupo de orgA para
  // aislar. El cupo tiene su propia suite: p2-b1-b2-concurrencia.test.mjs.
  await admin.from("ai_org_policy").upsert({ organization_id: orgA.orgId, max_concurrent_jobs: 100 });

  // --- RLS: sin INSERT/UPDATE/DELETE directo ---
  {
    const { error } = await orgA.asUser.from("jobs").insert({
      organization_id: orgA.orgId, tipo: "noop", estado: "COMPLETED",
    });
    check("1. un usuario no puede INSERT directo en jobs (RLS)", !!error);
  }

  // --- crear_job básico ---
  let jobA;
  {
    const { data, error } = await orgA.asUser.rpc("crear_job", {
      p_tipo: "noop", p_input: { hola: "mundo" },
    });
    jobA = data;
    check("2. crear_job crea un job para el usuario autenticado", !error && data?.estado === "AUTHORIZED", error?.message);
    check("3. el job se atribuye a la organización del llamante", data?.organization_id === orgA.orgId);
    check("4. crear_job deja el job en AUTHORIZED con authorized_at", !!data?.authorized_at && data?.intentos === 0);
  }

  // --- crear_job: autorización del recurso ---
  {
    const { data, error } = await orgA.asUser.rpc("crear_job", {
      p_tipo: "analizar-bases", p_recurso_tipo: "licitacion", p_recurso_id: licA,
    });
    check("5. crear_job acepta un recurso de la propia organización", !error && !!data?.id, error?.message);

    const { error: errAjeno } = await orgA.asUser.rpc("crear_job", {
      p_tipo: "analizar-bases", p_recurso_tipo: "licitacion", p_recurso_id: licB,
    });
    check("6. crear_job rechaza un recurso de otra organización (Recurso no encontrado)", !!errAjeno && /no encontrado/i.test(errAjeno.message));
  }

  // --- idempotencia ---
  {
    const key = `idem-${rnd()}`;
    const { data: j1 } = await orgA.asUser.rpc("crear_job", { p_tipo: "noop", p_idempotency_key: key });
    const { data: j2 } = await orgA.asUser.rpc("crear_job", { p_tipo: "noop", p_idempotency_key: key });
    check("7. crear_job con la misma idempotency_key devuelve el MISMO job", j1?.id === j2?.id);
    const { count } = await admin.from("jobs").select("id", { count: "exact", head: true })
      .eq("organization_id", orgA.orgId).eq("idempotency_key", key);
    check("8. solo existe una fila para esa idempotency_key", count === 1);
  }

  // --- RLS select entre organizaciones ---
  {
    const { data } = await orgB.asUser.from("jobs").select("id").eq("id", jobA.id);
    check("9. org B no ve los jobs de org A (RLS)", (data ?? []).length === 0);
    const { data: propios } = await orgA.asUser.from("jobs").select("id").eq("id", jobA.id);
    check("10. org A ve su propio job", (propios ?? []).length === 1);
  }

  // --- cancelar_job ---
  {
    const { data: j } = await orgA.asUser.rpc("crear_job", { p_tipo: "noop" });
    const { data: cancelado } = await orgA.asUser.rpc("cancelar_job", { p_job_id: j.id });
    check("11. cancelar_job pasa un job AUTHORIZED a CANCELLED", cancelado?.estado === "CANCELLED" && !!cancelado?.finished_at);

    const { error } = await orgB.asUser.rpc("cancelar_job", { p_job_id: j.id });
    check("12. cancelar_job de otra organización falla (Job no encontrado)", !!error && /no encontrado/i.test(error.message));
  }

  // --- ciclo del worker: reclamar (SKIP LOCKED), progreso, completar ---
  {
    const { data: j } = await orgA.asUser.rpc("crear_job", { p_tipo: "noop" });

    const { data: lote1 } = await admin.rpc("reclamar_jobs", { p_worker_id: "w-test-1", p_limite: 10 });
    const reclamado = (lote1 ?? []).find((x) => x.id === j.id);
    check("13. reclamar_jobs toma el job y lo pasa a RUNNING con intentos=1 y lease", reclamado?.estado === "RUNNING" && reclamado?.intentos === 1 && !!reclamado?.lease_expires_at);

    const { data: lote2 } = await admin.rpc("reclamar_jobs", { p_worker_id: "w-test-2", p_limite: 10 });
    check("14. una segunda reclamación no vuelve a tomar el mismo job (no doble procesamiento)", !(lote2 ?? []).some((x) => x.id === j.id));

    await admin.rpc("progreso_job", { p_job_id: j.id, p_progreso: 40, p_detalle: "medio" });
    const { data: mid } = await admin.from("jobs").select("progreso, progreso_detalle").eq("id", j.id).single();
    check("15. progreso_job actualiza progreso y detalle", mid.progreso === 40 && mid.progreso_detalle === "medio");

    const { data: done } = await admin.rpc("completar_job", {
      p_job_id: j.id, p_result_ref: { tabla: "analisis_bases", id: "x" },
      p_provider: "anthropic", p_modelo: "claude-sonnet-5", p_tokens_input: 100, p_tokens_output: 20,
    });
    check("16. completar_job pasa a COMPLETED con progreso=100 y result_ref", done?.estado === "COMPLETED" && done?.progreso === 100 && done?.result_ref?.tabla === "analisis_bases");
  }

  // --- fallar_job: reintento con backoff, luego dead letter ---
  {
    const { data: j } = await orgA.asUser.rpc("crear_job", { p_tipo: "noop", p_max_intentos: 2 });

    await admin.rpc("reclamar_jobs", { p_worker_id: "w", p_limite: 10 });
    const { data: r1 } = await admin.rpc("fallar_job", { p_job_id: j.id, p_error_seguro: "boom", p_reintentable: true });
    check("17. fallar_job reintentable -> RETRYING con next_attempt_at futuro", r1?.estado === "RETRYING" && new Date(r1.next_attempt_at) > new Date());

    // forzar que el backoff ya pasó
    await admin.from("jobs").update({ next_attempt_at: new Date(Date.now() - 1000).toISOString() }).eq("id", j.id);
    const { data: lote } = await admin.rpc("reclamar_jobs", { p_worker_id: "w", p_limite: 10 });
    check("18. un job RETRYING se vuelve a reclamar cuando next_attempt_at ya pasó", (lote ?? []).some((x) => x.id === j.id && x.intentos === 2));

    const { data: r2 } = await admin.rpc("fallar_job", { p_job_id: j.id, p_error_seguro: "boom otra vez", p_reintentable: true });
    check("19. sin intentos restantes -> FAILED", r2?.estado === "FAILED" && !!r2?.finished_at);

    const { data: dl } = await admin.from("jobs_dead_letter").select("job_id, motivo").eq("job_id", j.id);
    check("20. el job fallido se copió a jobs_dead_letter", (dl ?? []).length === 1 && dl[0].motivo === "max_intentos");
  }

  // --- prioridad ---
  {
    const { data: baja } = await orgA.asUser.rpc("crear_job", { p_tipo: "noop", p_prioridad: 200 });
    const { data: alta } = await orgA.asUser.rpc("crear_job", { p_tipo: "noop", p_prioridad: 50 });
    const { data: lote } = await admin.rpc("reclamar_jobs", { p_worker_id: "w-prio", p_limite: 1 });
    check("21. reclamar_jobs respeta la prioridad (menor primero)", lote?.[0]?.id === alta.id, `esperaba ${alta.id} (p50) antes que ${baja.id} (p200)`);
  }

  // --- reencolar step ---
  {
    const { data: j } = await orgA.asUser.rpc("crear_job", { p_tipo: "procesar-documento" });
    await admin.rpc("reclamar_jobs", { p_worker_id: "w", p_limite: 20 });
    const { data: re } = await admin.rpc("reencolar_step_job", {
      p_job_id: j.id, p_step: "embeddings", p_result_parcial: { texto: "ok" }, p_progreso: 30,
    });
    check("22. reencolar_step_job devuelve el job a AUTHORIZED con step_actual y progreso parcial", re?.estado === "AUTHORIZED" && re?.step_actual === "embeddings" && re?.progreso === 30 && re?.result_ref?.texto === "ok");
  }

  // --- expirar ---
  {
    const { data: j } = await orgA.asUser.rpc("crear_job", { p_tipo: "noop" });
    await admin.from("jobs").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("id", j.id);
    const { data: n } = await admin.rpc("expirar_jobs");
    check("23. expirar_jobs marca EXPIRED los jobs vencidos y devuelve el conteo", n >= 1);
    const { data: exp } = await admin.from("jobs").select("estado").eq("id", j.id).single();
    check("24. el job vencido quedó EXPIRED", exp.estado === "EXPIRED");
  }

  // limpieza
  try {
    await admin.from("jobs").delete().in("organization_id", [orgA.orgId, orgB.orgId]);
    await admin.from("jobs_dead_letter").delete().in("organization_id", [orgA.orgId, orgB.orgId]);
    await admin.auth.admin.deleteUser(orgA.userId);
    await admin.auth.admin.deleteUser(orgB.userId);
    await admin.from("organizations").delete().in("id", [orgA.orgId, orgB.orgId]);
  } catch { /* best-effort */ }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
