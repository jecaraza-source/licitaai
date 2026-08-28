// P2 · H4 — integration: job exportar-organizacion + exportar_datos_organizacion
// (migración 20260903000000, handler _shared/job-handlers/exportar-organizacion.ts).
//
//   npx supabase start   (stop/start si el edge no recogió el handler nuevo)
//   node tests/integration/p2-h4-exportar.test.mjs
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
let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  if (ok) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}${detail ? " — " + detail : ""}`); }
};
const rnd = () => Math.random().toString(36).slice(2, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const invokeWorker = () => fetch(`${FUNCTIONS_URL}/job-worker`, {
  method: "POST", headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
});
async function correrWorkerHasta(jobId, estados, maxTicks = 12) {
  const objetivo = Array.isArray(estados) ? estados : [estados];
  for (let i = 0; i < maxTicks; i++) {
    await invokeWorker().then((r) => r.json()).catch(() => ({}));
    await sleep(400);
    const { data } = await admin.from("jobs").select("*").eq("id", jobId).single();
    if (objetivo.includes(data.estado)) return data;
    if (data.next_attempt_at) {
      await admin.from("jobs").update({ next_attempt_at: new Date(Date.now() - 1000).toISOString() }).eq("id", jobId);
    }
  }
  return (await admin.from("jobs").select("*").eq("id", jobId).single()).data;
}

async function main() {
  // limpiar jobs colgados de corridas previas
  await admin.from("jobs").delete().in("estado", ["PENDING", "AUTHORIZED", "RETRYING", "RUNNING"]);

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

  // algo de contenido: 2 licitaciones + docs + actividad
  const licIds = [];
  for (let i = 0; i < 2; i++) {
    const { data: lic } = await admin.from("licitaciones").insert({
      organization_id: org.id, numero_expediente: `EXP-${rnd()}`, titulo: `Lic ${i}`,
      institucion: "Inst", tipo: "ADQUISICION", estado_id: "FEDERAL", sistema: "COMPRANET",
    }).select("id").single();
    licIds.push(lic.id);
    await admin.from("documentos").insert({
      licitacion_id: lic.id, nombre: `d${i}.pdf`, tipo_documento: "BASES",
      storage_path: `${org.id}/${lic.id}/d${i}.pdf`,
    });
  }

  // --- 1. exportar_datos_organizacion: bundle correcto ---
  {
    const { data: bundle, error } = await admin.rpc("exportar_datos_organizacion", { p_org: org.id });
    check("1. exportar_datos_organizacion no falla", !error, error?.message);
    check("2. formato + organization_id", bundle?.formato === "licitaai.export.v1" && bundle?.organization_id === org.id);
    check("3. licitaciones (2) y documentos (2) en el bundle", bundle.licitaciones.length === 2 && bundle.documentos.length === 2);
    check("4. organizations trae exactamente la propia", bundle.organizations.length === 1 && bundle.organizations[0].id === org.id);
    check("5. users incluye al usuario de la org", bundle.users.some((x) => x.id === u.user.id));
  }

  // --- 2. exportar_datos_organizacion no lo puede llamar authenticated ---
  {
    const { error } = await asUser.rpc("exportar_datos_organizacion", { p_org: org.id });
    check("6. authenticated no puede llamar exportar_datos_organizacion", !!error);
  }

  // --- 3. flag apagado -> el endpoint devolvería 404 (se prueba en e2e);
  //        aquí encolamos el job directo y corremos el worker ---
  {
    const { data: job, error } = await asUser.rpc("crear_job", {
      p_tipo: "exportar-organizacion", p_recurso_tipo: "organizacion", p_recurso_id: org.id,
      p_input: {}, p_idempotency_key: `export:${org.id}:test`, p_prioridad: 90,
      p_dedup_hash: null, p_max_intentos: 3, p_reserva_id: null,
    });
    check("7. crear_job(exportar-organizacion) ok", !error && !!job?.id, error?.message);

    const final = await correrWorkerHasta(job.id, ["COMPLETED", "FAILED"]);
    check("8. el job COMPLETA", final.estado === "COMPLETED", `estado=${final.estado} err=${final.error_interno_ref}`);

    const rr = final.result_ref ?? {};
    check("9. result_ref trae archivo, manifiesto, url y sha256",
      !!rr.archivo && !!rr.manifiesto && !!rr.url && /^[0-9a-f]{64}$/.test(rr.export_sha256 ?? ""));
    check("10. result_ref.tablas cuenta licitaciones=2", rr.tablas?.licitaciones === 2);

    // el archivo existe en Storage y su hash coincide
    const { data: dl, error: eDl } = await admin.storage.from("exportaciones").download(rr.archivo);
    check("11. export.json descargable de Storage", !eDl && !!dl, eDl?.message);
    if (dl) {
      const texto = await dl.text();
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
      const hex = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
      check("12. el sha256 del archivo coincide con result_ref", hex === rr.export_sha256);
      const parsed = JSON.parse(texto);
      check("13. el contenido es el bundle", parsed.organization_id === org.id);
    }

    // el bucket es privado: anon no puede leerlo sin firma
    const publicUrl = `${URL}/storage/v1/object/public/exportaciones/${rr.archivo}`;
    const r = await fetch(publicUrl);
    check("14. el bucket exportaciones NO es público", r.status >= 400);
  }

  // --- 4. idempotencia: crear_job devuelve el mismo job, no encola otro ---
  {
    const args = {
      p_tipo: "exportar-organizacion", p_recurso_tipo: "organizacion", p_recurso_id: org.id,
      p_input: {}, p_idempotency_key: `export:${org.id}:idem`, p_prioridad: 90,
      p_dedup_hash: null, p_max_intentos: 3, p_reserva_id: null,
    };
    const { data: j1 } = await asUser.rpc("crear_job", args);
    const { data: j2 } = await asUser.rpc("crear_job", args);
    check("15. segundo crear_job con misma idempotency_key devuelve el mismo job", j1.id === j2.id);
    const { count } = await admin.from("jobs").select("*", { count: "exact", head: true })
      .eq("organization_id", org.id).eq("idempotency_key", `export:${org.id}:idem`);
    check("16. no se encoló un job duplicado", count === 1);
    await admin.from("jobs").delete().eq("id", j1.id);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
