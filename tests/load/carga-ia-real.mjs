// P2 · J — validación end-to-end con IA REAL (acotada, NO carga masiva).
//
// Corre unos pocos jobs contra los proveedores de verdad para:
//   - confirmar que el camino no-MOCK funciona (extracción, embeddings,
//     análisis, persistencia en ai_results con citas)
//   - medir latencia real y tokens/coste por job vs. la estimación de
//     ai-estimate.ts
//
// GASTA DINERO REAL. Por defecto: 3 procesar-documento + 2 analizar-bases.
// Sube CARGA_IA_DOCS / CARGA_IA_ANALISIS con criterio.
//
// Requiere OPENAI_API_KEY y/o ANTHROPIC_API_KEY en el edge runtime
// (supabase/functions/.env + supabase stop/start) y JOB_MOCK_AI != "1".
//
//   node tests/load/carga-ia-real.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON = process.env.SUPABASE_ANON_KEY ?? "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";
const FUNCTIONS = `${URL}/functions/v1`;

if (URL.includes("supabase.co")) { console.error("Solo local."); process.exit(1); }

const N_DOCS = Number(process.env.CARGA_IA_DOCS ?? "3");
const N_ANALISIS = Number(process.env.CARGA_IA_ANALISIS ?? "2");

const admin = createClient(URL, SERVICE);
const rnd = () => Math.random().toString(36).slice(2, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PDF = readFileSync(join(import.meta.dirname, "../e2e/fixtures/documento-prueba.pdf"));
let problemas = 0;
const check = (ok, msg) => { console.log(`${ok ? "  ✓" : "  ✗"} ${msg}`); if (!ok) problemas++; };
const pct = (a, p) => a.length ? [...a].sort((x, y) => x - y)[Math.floor((p / 100) * a.length)] : 0;

const invokeWorker = () => fetch(`${FUNCTIONS}/job-worker`, {
  method: "POST", headers: { Authorization: `Bearer ${SERVICE}`, apikey: SERVICE },
}).then((r) => r.json()).catch(() => ({}));

async function correr(jobId, max = 40) {
  for (let i = 0; i < max; i++) {
    await invokeWorker();
    await sleep(800);
    const { data } = await admin.from("jobs").select("*").eq("id", jobId).single();
    if (["COMPLETED", "FAILED", "CANCELLED"].includes(data.estado)) return data;
    if (data.next_attempt_at) {
      await admin.from("jobs").update({ next_attempt_at: new Date(Date.now() - 1000).toISOString() }).eq("id", jobId);
    }
  }
  return (await admin.from("jobs").select("*").eq("id", jobId).single()).data;
}

async function setup() {
  const { data: org } = await admin.from("organizations").insert({ nombre: `IA real ${rnd()}` }).select("id").single();
  const { data: ticket } = await admin.from("signup_tickets").insert({ organization_id: org.id }).select("id").single();
  const email = `iareal-${rnd()}@example.org`;
  const { data: u } = await admin.auth.admin.createUser({
    email, password: "TestPassword123!", email_confirm: true,
    user_metadata: { nombre: "IA", signup_ticket: ticket.id },
  });
  // cuota alta para que la reserva no bloquee la prueba
  await admin.from("ai_org_policy").upsert({ organization_id: org.id, cuota_mensual_usd: 50, limite_diario_usd: 50 });
  const anon = createClient(URL, ANON);
  const { data: sess } = await anon.auth.signInWithPassword({ email, password: "TestPassword123!" });
  const asUser = createClient(URL, ANON, {
    global: { headers: { Authorization: `Bearer ${sess.session.access_token}` } },
  });
  const { data: lic } = await admin.from("licitaciones").insert({
    organization_id: org.id, numero_expediente: `EXP-${rnd()}`, titulo: "Lic IA real",
    institucion: "Inst", tipo: "SERVICIOS", estado_id: "FEDERAL", sistema: "COMPRANET",
  }).select("id").single();
  return { orgId: org.id, userId: u.user.id, asUser, licId: lic.id };
}

async function subirDoc(licId, nombre) {
  const path = `${licId}/${rnd()}-${nombre}`;
  await admin.storage.from("documentos-originales").upload(path, PDF, { contentType: "application/pdf", upsert: true });
  const { data } = await admin.from("documentos").insert({
    licitacion_id: licId, tipo_documento: "BASES", nombre, storage_path: path, tamanio_bytes: PDF.length,
  }).select("id").single();
  return data.id;
}

async function main() {
  console.log(`\n== P2·J — validación con IA REAL ==`);
  console.log(`procesar-documento×${N_DOCS} · analizar-bases×${N_ANALISIS}\n`);
  await admin.from("jobs").delete().in("estado", ["PENDING", "AUTHORIZED", "RETRYING", "RUNNING"]);

  // exige el camino de trazabilidad (ai_results) — se restaura al final
  await admin.from("feature_flags").update({ enabled: true }).eq("key", "ai.versionado_resultados");

  const s = await setup();
  const latDoc = [], latAnalisis = [];
  let tokensDoc = 0, tokensAnalisis = 0, costoDoc = 0, costoAnalisis = 0;
  const docIds = [];

  // --- procesar-documento (embeddings reales de OpenAI) ---
  for (let i = 0; i < N_DOCS; i++) {
    const docId = await subirDoc(s.licId, `bases-${i}.pdf`);
    docIds.push(docId);
    const { data: job } = await s.asUser.rpc("crear_job", {
      p_tipo: "procesar-documento", p_recurso_tipo: "documento", p_recurso_id: docId,
      p_input: { documento_id: docId }, p_idempotency_key: `iareal:proc:${docId}`,
      p_prioridad: 100, p_dedup_hash: null, p_max_intentos: 3, p_reserva_id: null,
    });
    const t0 = Date.now();
    const fin = await correr(job.id);
    latDoc.push(Date.now() - t0);
    check(fin.estado === "COMPLETED", `doc ${i}: COMPLETED (${fin.estado}${fin.error_seguro ? ` — ${fin.error_seguro}` : ""})`);
    tokensDoc += (fin.tokens_input ?? 0) + (fin.tokens_output ?? 0);
    costoDoc += Number(fin.costo_real_usd ?? 0);

    if (i === 0) {
      const { data: chunks } = await admin.from("document_chunks").select("embedding").eq("documento_id", docId);
      check((chunks ?? []).length > 0 && chunks.every((c) => c.embedding), `doc 0: ${chunks?.length} chunks con embedding`);
      // el mock usa [1, 0, 0, ...]; un embedding real no
      const primero = JSON.parse(chunks[0].embedding);
      const esMock = primero[0] === 1 && primero.slice(1, 10).every((x) => x === 0);
      check(!esMock, `doc 0: los embeddings son REALES (no el patrón mock)`);
      check(primero.length === 1536, `doc 0: dimensión 1536 (${primero.length})`);
    }
  }

  // --- analizar-bases (Claude real + embeddings) ---
  for (let i = 0; i < N_ANALISIS; i++) {
    const { data: job, error } = await s.asUser.rpc("crear_job", {
      p_tipo: "analizar-bases", p_recurso_tipo: "licitacion", p_recurso_id: s.licId,
      p_input: { licitacion_id: s.licId }, p_idempotency_key: `iareal:ab:${s.licId}:${i}`,
      p_prioridad: 100, p_dedup_hash: null, p_max_intentos: 3, p_reserva_id: null,
    });
    if (error) { check(false, `analisis ${i}: crear_job — ${error.message}`); continue; }
    const t0 = Date.now();
    const fin = await correr(job.id);
    latAnalisis.push(Date.now() - t0);
    check(fin.estado === "COMPLETED", `analisis ${i}: COMPLETED (${fin.estado}${fin.error_seguro ? ` — ${fin.error_seguro}` : ""})`);
    tokensAnalisis += (fin.tokens_input ?? 0) + (fin.tokens_output ?? 0);
    costoAnalisis += Number(fin.costo_real_usd ?? 0);
  }

  // --- trazabilidad: ai_results con contenido real ---
  const { data: resultados } = await admin.from("ai_results")
    .select("id, tipo_analisis, modelo, tokens_input, tokens_output, resultado_json, estado_aprobacion")
    .eq("organization_id", s.orgId).order("created_at", { ascending: false });
  check((resultados ?? []).length >= 1, `ai_results tiene ${resultados?.length ?? 0} filas`);
  if (resultados?.length) {
    const r = resultados[0];
    check(!!r.modelo && (r.tokens_input ?? 0) > 0, `ai_results[0]: modelo=${r.modelo} tokens_in=${r.tokens_input}`);
    check(JSON.stringify(r.resultado_json).length > 50, `ai_results[0]: resultado_json no vacío (${JSON.stringify(r.resultado_json).length} chars)`);
  }
  const { data: usos } = await admin.from("ai_usage_log").select("funcion, modelo, input_tokens, output_tokens").eq("organization_id", s.orgId);
  check((usos ?? []).some((u) => (u.input_tokens ?? 0) > 0), `ai_usage_log registró uso real (${usos?.length} filas)`);

  // coste real desde ai_usage_log × ai_model_pricing
  const { data: precios } = await admin.from("ai_model_pricing").select("modelo, input_usd_por_1m, output_usd_por_1m");
  const precioDe = (m) => precios.find((p) => p.modelo === m) ?? { input_usd_por_1m: 0, output_usd_por_1m: 0 };
  let costeProc = 0, costeAnal = 0;
  for (const u of usos ?? []) {
    const p = precioDe(u.modelo);
    const c = (u.input_tokens / 1e6) * Number(p.input_usd_por_1m) + (u.output_tokens / 1e6) * Number(p.output_usd_por_1m);
    if (u.funcion === "analizar-bases") costeAnal += c; else costeProc += c;
  }
  costoDoc = costeProc; costoAnalisis = costeAnal;

  console.log(`\n== resultados IA real ==`);
  console.log(`  procesar-documento: ${latDoc.length} jobs · latencia p50/p95 ${pct(latDoc, 50)}/${pct(latDoc, 95)} ms`);
  console.log(`    tokens totales: ${tokensDoc}  ·  coste real: $${costoDoc.toFixed(5)}`);
  console.log(`  analizar-bases:     ${latAnalisis.length} jobs · latencia p50/p95 ${pct(latAnalisis, 50)}/${pct(latAnalisis, 95)} ms`);
  console.log(`    tokens totales: ${tokensAnalisis}  ·  coste real: $${costoAnalisis.toFixed(5)}`);
  console.log(`  COSTE TOTAL DE ESTA CORRIDA: $${(costoDoc + costoAnalisis).toFixed(4)}`);

  // limpieza
  await admin.from("feature_flags").update({ enabled: false }).eq("key", "ai.versionado_resultados");
  await admin.from("jobs").delete().eq("organization_id", s.orgId);
  await admin.from("document_chunks").delete().in("documento_id", docIds);

  console.log(`\n${problemas === 0 ? "IA REAL OK" : `IA REAL CON ${problemas} PROBLEMA(S)`}`);
  process.exit(problemas === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
