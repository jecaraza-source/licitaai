// P2 · J / pendiente C6 — carga SOSTENIDA con IA real.
//
// Complementa a carga-ia-real.mjs (que corre pocos jobs UNO POR UNO). Aquí se
// encolan decenas de `analizar-bases` repartidas en varias organizaciones y se
// drenan con varias invocaciones CONCURRENTES del worker, para ver lo que una
// corrida serial no puede ver:
//   - cómo reacciona el circuit breaker de Anthropic/OpenAI bajo 429 y 5xx
//     reales (transiciones CLOSED → OPEN → HALF_OPEN → CLOSED)
//   - cuántos jobs reintentan (intentos > 1) y con qué error_seguro terminan
//   - latencia de cola (created_at → started_at) y duración por job con
//     latencia real de proveedor (20–30 s por análisis)
//   - throughput, equidad entre organizaciones y gasto real
//
// GASTA DINERO REAL. Cada `analizar-bases` cuesta ~US$0.03. Por seguridad:
//   - exige un tope explícito (CARGA_IA_MAX_USD, por defecto 2) y no arranca si
//     jobs × coste estimado lo supera
//   - durante la corrida suma el coste real y, si pasa el tope, CANCELA lo que
//     queda en cola y termina
//   - solo corre contra Supabase LOCAL
//
// Lo que NO puede hacer: provocar un 429. Si Anthropic no limita la tasa con
// tu carga, el reporte dirá "no se observaron reintentos ni aperturas del
// breaker" — eso es un resultado, no un fallo. Para forzarlo, sube
// CARGA_IA_WORKERS y CARGA_IA_ANALISIS con el tope de gasto a la vista.
//
// Requisitos: OPENAI_API_KEY y ANTHROPIC_API_KEY en supabase/functions/.env
// (gitignored), JOB_MOCK_AI != 1, y `npx supabase start`. Ver README.md §3.
//
//   CARGA_IA_ANALISIS=30 CARGA_IA_WORKERS=6 CARGA_IA_MAX_USD=2 \
//     node tests/load/carga-ia-sostenida.mjs
//
// Variables:
//   CARGA_IA_ANALISIS   jobs analizar-bases a encolar            (20)
//   CARGA_IA_ORGS       organizaciones entre las que se reparten (3)
//   CARGA_IA_WORKERS    invocaciones concurrentes del worker     (6)
//   CARGA_IA_MAX_USD    tope de gasto de la corrida              (2)
//   CARGA_IA_COSTO_EST  coste estimado por job para el tope      (0.05)
//   CARGA_IA_TIMEOUT_MIN  límite de duración total               (15)
//   CARGA_IA_SIMULADO=1 permite correr SIN proveedores reales (valida el
//                       arnés; el worker usa mocks y no se mide IA)
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LOCAL } from "../helpers/local-supabase.mjs";

const URL = process.env.SUPABASE_URL ?? LOCAL.url;
const ANON = process.env.SUPABASE_ANON_KEY ?? LOCAL.anonKey;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? LOCAL.serviceRoleKey;
const FUNCTIONS = `${URL}/functions/v1`;

if (URL.includes("supabase.co")) {
  console.error("Rechazo correr contra un proyecto remoto — solo local.");
  process.exit(1);
}

const num = (nombre, defecto) => {
  const v = Number(process.env[nombre] ?? defecto);
  if (!Number.isFinite(v) || v <= 0) {
    console.error(`${nombre} debe ser un número > 0 (recibí "${process.env[nombre]}").`);
    process.exit(1);
  }
  return v;
};
const N_ANALISIS = Math.floor(num("CARGA_IA_ANALISIS", 20));
const N_ORGS = Math.floor(num("CARGA_IA_ORGS", 3));
const N_WORKERS = Math.floor(num("CARGA_IA_WORKERS", 6));
const MAX_USD = num("CARGA_IA_MAX_USD", 2);
const COSTO_EST = num("CARGA_IA_COSTO_EST", 0.05);
const TIMEOUT_MS = num("CARGA_IA_TIMEOUT_MIN", 15) * 60_000;
const SIMULADO = process.env.CARGA_IA_SIMULADO === "1";
const MUESTREO_MS = 2000;

if (!SIMULADO && N_ANALISIS * COSTO_EST > MAX_USD) {
  console.error(
    `No arranco: ${N_ANALISIS} jobs × US$${COSTO_EST} = US$${(N_ANALISIS * COSTO_EST).toFixed(2)} ` +
      `supera el tope CARGA_IA_MAX_USD=${MAX_USD}. Baja CARGA_IA_ANALISIS o sube el tope a conciencia.`,
  );
  process.exit(1);
}

const admin = createClient(URL, SERVICE);
const rnd = () => Math.random().toString(36).slice(2, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PDF = readFileSync(join(import.meta.dirname, "../e2e/fixtures/documento-prueba.pdf"));
const TERMINALES = ["COMPLETED", "FAILED", "CANCELLED", "EXPIRED"];
let problemas = 0;
const check = (ok, msg) => {
  console.log(`${ok ? "  ✓" : "  ✗"} ${msg}`);
  if (!ok) problemas++;
};
const pct = (a, p) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
const seg = (ms) => (ms / 1000).toFixed(1);

const FLAGS = ["ai.versionado_resultados", "resiliencia.circuit_breaker", "ai.cache"];
const FLAGS_DURANTE = {
  "ai.versionado_resultados": true, // exige el camino de trazabilidad
  "resiliencia.circuit_breaker": true, // es lo que se observa
  "ai.cache": false, // si estuviera encendido, jobs repetidos no llegarían al proveedor
};

async function guardarFlags() {
  const { data } = await admin.from("feature_flags").select("key, enabled").in("key", FLAGS);
  const previos = Object.fromEntries((data ?? []).map((f) => [f.key, f.enabled]));
  for (const [key, enabled] of Object.entries(FLAGS_DURANTE)) {
    await admin.from("feature_flags").update({ enabled }).eq("key", key);
  }
  return previos;
}
async function restaurarFlags(previos) {
  for (const [key, enabled] of Object.entries(previos)) {
    await admin.from("feature_flags").update({ enabled }).eq("key", key);
  }
}

/** Deja el breaker local limpio: una corrida no debe heredar (ni dejar) un
 * circuito abierto por otra. */
async function reiniciarBreaker() {
  await admin.from("provider_health")
    .update({ estado: "CLOSED", fallos_consecutivos: 0, abierto_hasta: null })
    .in("provider", ["anthropic", "openai"]);
}

async function crearOrg(i) {
  const { data: org } = await admin.from("organizations").insert({ nombre: `Sostenida ${i} ${rnd()}` }).select("id").single();
  const { data: ticket } = await admin.from("signup_tickets").insert({ organization_id: org.id }).select("id").single();
  const email = `sostenida-${rnd()}@example.org`;
  const { data: u } = await admin.auth.admin.createUser({
    email, password: "TestPassword123!", email_confirm: true,
    user_metadata: { nombre: "Carga", signup_ticket: ticket.id },
  });
  // Cuota alta (el tope real de gasto lo pone este script) y cupo de jobs
  // simultáneos por org suficiente para que la concurrencia dependa de los
  // workers y no del cupo.
  await admin.from("ai_org_policy").upsert({
    organization_id: org.id, cuota_mensual_usd: 50, limite_diario_usd: 50, max_concurrent_jobs: 20,
  });
  const anon = createClient(URL, ANON);
  const { data: sess } = await anon.auth.signInWithPassword({ email, password: "TestPassword123!" });
  const asUser = createClient(URL, ANON, {
    global: { headers: { Authorization: `Bearer ${sess.session.access_token}` } },
  });
  const { data: lic } = await admin.from("licitaciones").insert({
    organization_id: org.id, numero_expediente: `EXP-${rnd()}`, titulo: `Lic sostenida ${i}`,
    institucion: "Inst", tipo: "SERVICIOS", estado_id: "FEDERAL", sistema: "COMPRANET",
  }).select("id").single();
  const path = `${lic.id}/${rnd()}-bases.pdf`;
  await admin.storage.from("documentos-originales").upload(path, PDF, { contentType: "application/pdf", upsert: true });
  const { data: doc } = await admin.from("documentos").insert({
    licitacion_id: lic.id, tipo_documento: "BASES", nombre: "bases.pdf", storage_path: path, tamanio_bytes: PDF.length,
  }).select("id").single();
  return { orgId: org.id, userId: u.user.id, asUser, licId: lic.id, docId: doc.id };
}

const invocarWorker = () =>
  fetch(`${FUNCTIONS}/job-worker`, {
    method: "POST", headers: { Authorization: `Bearer ${SERVICE}`, apikey: SERVICE },
  }).then((r) => r.json()).catch(() => ({}));

/** Procesa el documento de cada org (chunks + embeddings) antes del análisis. */
async function prepararDocumentos(orgs) {
  const jobs = [];
  for (const o of orgs) {
    const { data: job, error } = await o.asUser.rpc("crear_job", {
      p_tipo: "procesar-documento", p_recurso_tipo: "documento", p_recurso_id: o.docId,
      p_input: { documento_id: o.docId }, p_idempotency_key: `sost:proc:${o.docId}`,
      p_prioridad: 100, p_dedup_hash: null, p_max_intentos: 3, p_reserva_id: null,
    });
    if (error) { check(false, `procesar-documento: crear_job — ${error.message}`); continue; }
    jobs.push(job.id);
  }
  const limite = Date.now() + 5 * 60_000;
  while (Date.now() < limite) {
    const w = await invocarWorker();
    if (process.env.CARGA_IA_DEBUG === "1") console.log("  [worker]", JSON.stringify(w));
    const { data } = await admin.from("jobs").select("id, estado, next_attempt_at").in("id", jobs);
    if (process.env.CARGA_IA_DEBUG === "1") console.log("  [jobs]", JSON.stringify(data));
    if ((data ?? []).every((j) => TERMINALES.includes(j.estado))) break;
    // Preparación: no es lo que se mide, así que se acelera el backoff.
    for (const j of data ?? []) {
      if (j.next_attempt_at) {
        await admin.from("jobs").update({ next_attempt_at: new Date(Date.now() - 1000).toISOString() }).eq("id", j.id);
      }
    }
    await sleep(800);
  }
  const { data: fin } = await admin.from("jobs").select("estado, error_seguro").in("id", jobs);
  const malos = (fin ?? []).filter((j) => j.estado !== "COMPLETED");
  check(malos.length === 0, `documentos procesados: ${(fin ?? []).length - malos.length}/${jobs.length}` +
    (malos[0] ? ` — estado ${malos[0].estado}${malos[0].error_seguro ? `: ${malos[0].error_seguro}` : ""}` : ""));
  return malos.length === 0;
}

async function embeddingsSonReales(docId) {
  const { data: chunks } = await admin.from("document_chunks").select("embedding").eq("documento_id", docId).limit(1);
  if (!chunks?.length || !chunks[0].embedding) return false;
  const v = typeof chunks[0].embedding === "string" ? JSON.parse(chunks[0].embedding) : chunks[0].embedding;
  const esMock = v[0] === 1 && v.slice(1, 10).every((x) => x === 0);
  return !esMock && v.length === 1536;
}

async function main() {
  console.log(`\n== P2·J · C6 — carga sostenida con IA ${SIMULADO ? "SIMULADA (arnés)" : "REAL"} ==`);
  console.log(`analizar-bases×${N_ANALISIS} · ${N_ORGS} orgs · ${N_WORKERS} workers concurrentes · tope US$${MAX_USD}\n`);

  await admin.from("jobs").delete().in("estado", ["PENDING", "AUTHORIZED", "RETRYING", "RUNNING"]);
  const flagsPrevios = await guardarFlags();
  await reiniciarBreaker();
  const orgs = [];
  let limpiado = false;
  const limpiar = async () => {
    if (limpiado) return;
    limpiado = true;
    await restaurarFlags(flagsPrevios);
    await reiniciarBreaker();
    if (orgs.length) {
      await admin.from("jobs").delete().in("organization_id", orgs.map((o) => o.orgId));
      await admin.from("document_chunks").delete().in("documento_id", orgs.map((o) => o.docId));
    }
  };
  // Ctrl+C o kill: deja flags, breaker y datos como estaban antes de salir.
  for (const sig of ["SIGINT", "SIGTERM"]) {
    process.on(sig, () => { limpiar().finally(() => process.exit(130)); });
  }
  const todosLosJobs = [];
  let parar = false;
  let motivoParo = null;

  try {
    for (let i = 0; i < N_ORGS; i++) orgs.push(await crearOrg(i));

    // 1. Documentos → chunks con embeddings (necesarios para analizar-bases).
    const okDocs = await prepararDocumentos(orgs);
    if (!okDocs) throw new Error("No se pudieron preparar los documentos; no sigo.");
    if (!SIMULADO) {
      const real = await embeddingsSonReales(orgs[0].docId);
      check(real, "los embeddings son REALES (no el patrón mock) — el worker NO está en modo mock");
      if (!real) {
        throw new Error(
          "El worker parece estar en modo mock (JOB_MOCK_AI=1 o sin API keys en supabase/functions/.env). " +
            "No sigo para no medir nada falso. Para validar solo el arnés usa CARGA_IA_SIMULADO=1.",
        );
      }
    }

    // 2. Encolar todos los análisis de golpe, repartidos entre orgs.
    console.log(`\nEncolando ${N_ANALISIS} análisis…`);
    const t0 = Date.now();
    const creaciones = [];
    for (let i = 0; i < N_ANALISIS; i++) {
      const o = orgs[i % orgs.length];
      creaciones.push(
        o.asUser.rpc("crear_job", {
          p_tipo: "analizar-bases", p_recurso_tipo: "licitacion", p_recurso_id: o.licId,
          p_input: { licitacion_id: o.licId }, p_idempotency_key: `sost:ab:${o.licId}:${i}`,
          p_prioridad: 100, p_dedup_hash: null, p_max_intentos: 3, p_reserva_id: null,
        }).then(({ data, error }) => ({ data, error, i })),
      );
    }
    for (const r of await Promise.all(creaciones)) {
      if (r.error) check(false, `análisis ${r.i}: crear_job — ${r.error.message}`);
      else todosLosJobs.push(r.data.id);
    }
    console.log(`  ${todosLosJobs.length}/${N_ANALISIS} encolados en ${seg(Date.now() - t0)} s`);

    // 3. Workers concurrentes: cada uno invoca el worker en bucle hasta que
    //    se acabe el trabajo o se pida parar.
    const inicio = Date.now();
    let workersActivos = 0;
    let picoWorkers = 0;
    const lazoWorker = async () => {
      while (!parar && Date.now() - inicio < TIMEOUT_MS) {
        workersActivos++;
        picoWorkers = Math.max(picoWorkers, workersActivos);
        await invocarWorker();
        workersActivos--;
        await sleep(300);
      }
    };
    const workers = Array.from({ length: N_WORKERS }, () => lazoWorker());

    // 4. Muestreo: estados, breaker y tope de gasto.
    const lineaDeTiempo = []; // { t, estados, breaker }
    const transicionesBreaker = []; // { t, provider, de, a, fallos }
    const ultimoBreaker = {};
    let costeVisto = 0;
    let maxRunning = 0;
    let maxRetrying = 0;
    while (true) {
      const { data: jobs } = await admin.from("jobs")
        .select("id, estado, costo_real_usd").in("id", todosLosJobs);
      const { data: salud } = await admin.from("provider_health")
        .select("provider, estado, fallos_consecutivos").in("provider", ["anthropic", "openai"]);
      const estados = {};
      for (const j of jobs ?? []) estados[j.estado] = (estados[j.estado] ?? 0) + 1;
      costeVisto = (jobs ?? []).reduce((a, j) => a + Number(j.costo_real_usd ?? 0), 0);
      maxRunning = Math.max(maxRunning, estados.RUNNING ?? 0);
      maxRetrying = Math.max(maxRetrying, estados.RETRYING ?? 0);
      const t = Date.now() - inicio;
      for (const s of salud ?? []) {
        const previo = ultimoBreaker[s.provider];
        if (previo !== undefined && previo !== s.estado) {
          transicionesBreaker.push({ t, provider: s.provider, de: previo, a: s.estado, fallos: s.fallos_consecutivos });
        }
        ultimoBreaker[s.provider] = s.estado;
      }
      lineaDeTiempo.push({ t, estados });
      const pendientes = (jobs ?? []).filter((j) => !TERMINALES.includes(j.estado)).length;
      process.stdout.write(
        `\r  t=${seg(t)}s  ${Object.entries(estados).map(([k, v]) => `${k}:${v}`).join(" ")}  ` +
          `coste≈$${costeVisto.toFixed(3)}   `,
      );
      if (pendientes === 0) break;
      if (costeVisto >= MAX_USD) {
        motivoParo = `se alcanzó el tope de gasto (US$${costeVisto.toFixed(3)} ≥ US$${MAX_USD})`;
        break;
      }
      if (t >= TIMEOUT_MS) {
        motivoParo = `se agotó el tiempo (${TIMEOUT_MS / 60_000} min)`;
        break;
      }
      await sleep(MUESTREO_MS);
    }
    process.stdout.write("\n");
    parar = true;
    if (motivoParo) {
      console.log(`\n  PARO: ${motivoParo}. Cancelo lo que queda en cola.`);
      await admin.from("jobs").update({ estado: "CANCELLED", finished_at: new Date().toISOString() })
        .in("id", todosLosJobs).in("estado", ["PENDING", "AUTHORIZED", "RETRYING"]);
    }
    await Promise.race([Promise.all(workers), sleep(60_000)]);
    const duracion = Date.now() - inicio;

    // 5. Informe.
    const { data: filas } = await admin.from("jobs")
      .select("id, organization_id, estado, intentos, error_seguro, created_at, started_at, finished_at, costo_real_usd, tokens_input, tokens_output, modelo")
      .in("id", todosLosJobs);
    const completados = (filas ?? []).filter((j) => j.estado === "COMPLETED");
    const fallidos = (filas ?? []).filter((j) => j.estado === "FAILED" || j.estado === "EXPIRED");
    const cancelados = (filas ?? []).filter((j) => j.estado === "CANCELLED");
    const conReintento = (filas ?? []).filter((j) => (j.intentos ?? 0) > 1);
    const colaMs = (filas ?? []).filter((j) => j.started_at).map((j) => new Date(j.started_at) - new Date(j.created_at));
    const durMs = completados.filter((j) => j.started_at && j.finished_at)
      .map((j) => new Date(j.finished_at) - new Date(j.started_at));
    const errores = {};
    for (const j of [...fallidos, ...conReintento]) {
      const k = j.error_seguro ?? "(sin mensaje)";
      errores[k] = (errores[k] ?? 0) + 1;
    }
    const { data: usos } = await admin.from("ai_usage_log").select("modelo, input_tokens, output_tokens")
      .in("organization_id", orgs.map((o) => o.orgId));
    const { data: precios } = await admin.from("ai_model_pricing").select("modelo, input_usd_por_1m, output_usd_por_1m");
    let costeReal = 0;
    for (const u of usos ?? []) {
      const p = (precios ?? []).find((x) => x.modelo === u.modelo) ?? { input_usd_por_1m: 0, output_usd_por_1m: 0 };
      costeReal += (u.input_tokens / 1e6) * Number(p.input_usd_por_1m) + (u.output_tokens / 1e6) * Number(p.output_usd_por_1m);
    }
    const porOrg = {};
    for (const j of completados) porOrg[j.organization_id] = (porOrg[j.organization_id] ?? 0) + 1;

    console.log(`\n== resultados ==`);
    console.log(`  jobs: ${completados.length} completados · ${fallidos.length} fallidos · ${cancelados.length} cancelados de ${todosLosJobs.length}`);
    console.log(`  duración total: ${seg(duracion)} s · throughput: ${(completados.length / (duracion / 60_000)).toFixed(1)} jobs/min`);
    console.log(`  concurrencia observada: pico RUNNING=${maxRunning} · pico de invocaciones del worker=${picoWorkers}/${N_WORKERS} · pico RETRYING=${maxRetrying}`);
    console.log(`  latencia de cola (creado→iniciado) p50/p95/p99: ${seg(pct(colaMs, 50))}/${seg(pct(colaMs, 95))}/${seg(pct(colaMs, 99))} s`);
    console.log(`  duración por job p50/p95/p99: ${seg(pct(durMs, 50))}/${seg(pct(durMs, 95))}/${seg(pct(durMs, 99))} s`);
    console.log(`  jobs con reintento (intentos>1): ${conReintento.length}`);
    for (const [msg, n] of Object.entries(errores)) console.log(`    ${n}× ${msg}`);
    console.log(`  breaker: ${transicionesBreaker.length === 0 ? "sin transiciones (nunca abrió)" : `${transicionesBreaker.length} transición(es)`}`);
    for (const tr of transicionesBreaker) {
      console.log(`    t=${seg(tr.t)}s ${tr.provider}: ${tr.de} → ${tr.a} (fallos consecutivos: ${tr.fallos})`);
    }
    console.log(`  reparto entre orgs (completados): ${orgs.map((o) => porOrg[o.orgId] ?? 0).join(" / ")}`);
    console.log(`  coste real (ai_usage_log × precios): US$${costeReal.toFixed(4)} · tokens in/out: ` +
      `${(filas ?? []).reduce((a, j) => a + (j.tokens_input ?? 0), 0)}/${(filas ?? []).reduce((a, j) => a + (j.tokens_output ?? 0), 0)}`);

    console.log(`\n== comprobaciones ==`);
    check(!motivoParo, `la corrida terminó por sí sola${motivoParo ? ` (${motivoParo})` : ""}`);
    check((filas ?? []).every((j) => TERMINALES.includes(j.estado)), "ningún job quedó sin estado terminal");
    check((filas ?? []).every((j) => (j.intentos ?? 0) <= 3), "ningún job superó max_intentos");
    check(costeReal <= MAX_USD || SIMULADO, `el gasto real (US$${costeReal.toFixed(3)}) no pasó el tope (US$${MAX_USD})`);
    const abrio = transicionesBreaker.some((t) => t.a === "OPEN");
    if (abrio) {
      const { data: finalSalud } = await admin.from("provider_health").select("provider, estado");
      console.log(`  (el breaker abrió; estado final: ${(finalSalud ?? []).map((s) => `${s.provider}=${s.estado}`).join(", ")})`);
    }
    if (!SIMULADO && conReintento.length === 0 && !abrio) {
      console.log("  NOTA: no se observaron reintentos ni aperturas del breaker. El proveedor no limitó la tasa con esta carga;");
      console.log("        eso NO demuestra que el breaker funcione bajo 429. Sube CARGA_IA_WORKERS/ANALISIS (con el tope a la vista) para presionar más.");
    }
    if (SIMULADO) console.log("  NOTA: corrida SIMULADA — valida el arnés, no mide proveedores reales.");
  } finally {
    await limpiar();
  }

  console.log(`\n${problemas === 0 ? "CARGA SOSTENIDA OK" : `CARGA SOSTENIDA CON ${problemas} PROBLEMA(S)`}`);
  process.exit(problemas === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
