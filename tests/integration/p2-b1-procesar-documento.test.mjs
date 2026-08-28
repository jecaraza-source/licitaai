// P2 · B1 — integration tests para procesar-documento vía jobs
// (handler _shared/job-handlers/procesar-documento.ts).
//
// Sin OPENAI_API_KEY en local, el handler usa embeddings simulados
// (MOCK_AI), así que estas pruebas ejercen todo el flujo multi-step:
// extraer -> chunk -> embeddings -> finalizar, idempotencia, y el fallo por
// magic bytes que no corresponden.
//
// Usage:
//   npx supabase start   (o stop/start si el edge runtime no recogió el handler)
//   node tests/integration/p2-b1-procesar-documento.test.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
const PDF = readFileSync(join(import.meta.dirname, "../e2e/fixtures/documento-prueba.pdf"));

function invokeWorker() {
  return fetch(`${FUNCTIONS_URL}/job-worker`, {
    method: "POST", headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
  });
}
async function correrWorkerHasta(jobId, estados, maxTicks = 10) {
  const objetivo = Array.isArray(estados) ? estados : [estados];
  for (let i = 0; i < maxTicks; i++) {
    await invokeWorker().then((r) => r.json());
    await sleep(400);
    const { data } = await admin.from("jobs").select("*").eq("id", jobId).single();
    if (objetivo.includes(data.estado)) return data;
    if (data.next_attempt_at) {
      await admin.from("jobs").update({ next_attempt_at: new Date(Date.now() - 1000).toISOString() }).eq("id", jobId);
    }
  }
  return (await admin.from("jobs").select("*").eq("id", jobId).single()).data;
}

async function setup() {
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
  await admin.from("ai_org_policy").upsert({ organization_id: org.id, max_concurrent_jobs: 100 }); // B1 cupo — no interferir
  const { data: lic } = await admin.from("licitaciones").insert({
    organization_id: org.id, numero_expediente: `EXP-${rnd()}`, titulo: "Lic", institucion: "I",
    tipo: "SERVICIOS", estado_id: "FEDERAL", sistema: "COMPRANET",
  }).select("id").single();
  return { org, userId: u.user.id, asUser, licId: lic.id };
}

async function subirDoc(licId, contenido, nombre = "bases.pdf") {
  const path = `${licId}/${rnd()}-${nombre}`;
  const { error } = await admin.storage.from("documentos-originales")
    .upload(path, contenido, { contentType: "application/pdf", upsert: true });
  if (error) throw new Error(`upload: ${error.message}`);
  const { data } = await admin.from("documentos").insert({
    licitacion_id: licId, tipo_documento: "BASES", nombre, storage_path: path,
    tamanio_bytes: contenido.length,
  }).select("id").single();
  return data.id;
}

async function main() {
  const s = await setup();

  // --- happy path: PDF con texto -> COMPLETED con chunks y embeddings ---
  {
    const docId = await subirDoc(s.licId, PDF);
    const { data: job, error } = await s.asUser.rpc("crear_job", {
      p_tipo: "procesar-documento", p_recurso_tipo: "documento", p_recurso_id: docId,
      p_input: { documento_id: docId }, p_idempotency_key: `procdoc:${docId}`,
    });
    check("1. crear_job acepta un documento de la organización", !error && !!job?.id, error?.message);

    const final = await correrWorkerHasta(job.id, ["COMPLETED", "FAILED"]);
    check("2. el job de procesamiento llega a COMPLETED", final.estado === "COMPLETED", `${final.estado} / ${final.error_seguro}`);
    check("3. result_ref reporta chunks > 0", (final.result_ref?.chunks ?? 0) > 0, JSON.stringify(final.result_ref));

    const { data: chunks } = await admin.from("document_chunks").select("id, embedding").eq("documento_id", docId);
    check("4. se crearon document_chunks", (chunks ?? []).length > 0);
    check("5. todos los chunks quedaron con embedding", (chunks ?? []).every((c) => c.embedding !== null));

    const { data: doc } = await admin.from("documentos").select("procesado, procesado_at").eq("id", docId).single();
    check("6. documentos.procesado quedó en true", doc.procesado === true && !!doc.procesado_at);

    const { data: uso } = await admin.from("ai_usage_log").select("funcion, modelo").eq("organization_id", s.org.id);
    check("7. se registró uso de IA por el worker", (uso ?? []).some((u) => u.funcion === "procesar-documento"));
  }

  // --- idempotencia: misma idempotency_key -> mismo job ---
  {
    const docId = await subirDoc(s.licId, PDF);
    const { data: j1 } = await s.asUser.rpc("crear_job", {
      p_tipo: "procesar-documento", p_recurso_tipo: "documento", p_recurso_id: docId,
      p_input: { documento_id: docId }, p_idempotency_key: `procdoc:${docId}`,
    });
    const { data: j2 } = await s.asUser.rpc("crear_job", {
      p_tipo: "procesar-documento", p_recurso_tipo: "documento", p_recurso_id: docId,
      p_input: { documento_id: docId }, p_idempotency_key: `procdoc:${docId}`,
    });
    check("8. dos crear_job con la misma clave -> el mismo job", j1.id === j2.id);
  }

  // --- reprocesar: el step extraer limpia los chunks previos ---
  {
    const docId = await subirDoc(s.licId, PDF);
    const j1 = (await s.asUser.rpc("crear_job", {
      p_tipo: "procesar-documento", p_recurso_tipo: "documento", p_recurso_id: docId,
      p_input: { documento_id: docId }, p_idempotency_key: `procdoc:${docId}:1`,
    })).data;
    await correrWorkerHasta(j1.id, ["COMPLETED", "FAILED"]);
    const n1 = (await admin.from("document_chunks").select("id", { count: "exact", head: true }).eq("documento_id", docId)).count;

    const j2 = (await s.asUser.rpc("crear_job", {
      p_tipo: "procesar-documento", p_recurso_tipo: "documento", p_recurso_id: docId,
      p_input: { documento_id: docId }, p_idempotency_key: `procdoc:${docId}:2`,
    })).data;
    await correrWorkerHasta(j2.id, ["COMPLETED", "FAILED"]);
    const n2 = (await admin.from("document_chunks").select("id", { count: "exact", head: true }).eq("documento_id", docId)).count;
    check("9. reprocesar no duplica chunks (extraer limpia los previos)", n1 === n2 && n1 > 0, `${n1} -> ${n2}`);
  }

  // --- magic bytes que no corresponden -> FAILED sin reintentar ---
  {
    const docId = await subirDoc(s.licId, Buffer.from("esto no es un pdf, es texto plano".repeat(20)), "falso.pdf");
    const job = (await s.asUser.rpc("crear_job", {
      p_tipo: "procesar-documento", p_recurso_tipo: "documento", p_recurso_id: docId,
      p_input: { documento_id: docId }, p_idempotency_key: `procdoc:${docId}`, p_max_intentos: 3,
    })).data;
    const final = await correrWorkerHasta(job.id, ["FAILED", "COMPLETED"]);
    check("10. un archivo cuyo contenido no es PDF -> FAILED sin reintentar (intentos=1)", final.estado === "FAILED" && final.intentos === 1, `${final.estado}/${final.intentos}`);
    const { data: doc } = await admin.from("documentos").select("procesado").eq("id", docId).single();
    check("11. el documento no queda marcado como procesado", doc.procesado === false);
  }

  // limpieza
  try {
    await admin.from("jobs").delete().eq("organization_id", s.org.id);
    await admin.from("jobs_dead_letter").delete().eq("organization_id", s.org.id);
    await admin.auth.admin.deleteUser(s.userId);
    await admin.from("organizations").delete().eq("id", s.org.id);
  } catch { /* best-effort */ }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
