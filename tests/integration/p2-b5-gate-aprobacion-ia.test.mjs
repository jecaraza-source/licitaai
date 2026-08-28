// P2 punch-list B5 — licitacion_analisis_ia_pendientes: detección de
// versiones activas de ai_results en PENDIENTE.
//
// Usage:
//   npx supabase start
//   node tests/integration/p2-b5-gate-aprobacion-ia.test.mjs
import { createClient } from "@supabase/supabase-js";
import { LOCAL } from "../helpers/local-supabase.mjs";

const URL = process.env.SUPABASE_URL ?? LOCAL.url;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? LOCAL.serviceRoleKey;
if (URL.includes("supabase.co")) { console.error("local only"); process.exit(1); }

const admin = createClient(URL, SERVICE_KEY);
let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}${detail ? " — " + detail : ""}`); }
}
const rnd = () => Math.random().toString(36).slice(2, 10);

async function insertarResultado(orgId, licId, tipo, estado, docId = null, offsetMs = 0) {
  const { data, error } = await admin.from("ai_results").insert({
    organization_id: orgId,
    recurso_tipo: "licitacion",
    recurso_id: licId,
    documento_id: docId,
    tipo_analisis: tipo,
    resultado_json: { x: 1 },
    estado_aprobacion: estado,
    origen: "manual",
    created_at: new Date(Date.now() + offsetMs).toISOString(),
  }).select("id").single();
  if (error) throw new Error(`insertarResultado: ${error.message}`);
  return data.id;
}
const pendientes = (licId) =>
  admin.rpc("licitacion_analisis_ia_pendientes", { p_licitacion_id: licId })
    .then(({ data, error }) => { if (error) throw new Error(error.message); return data ?? []; });

async function main() {
  const { data: org } = await admin.from("organizations").insert({ nombre: `Org ${rnd()}` }).select("id").single();
  const { data: lic } = await admin.from("licitaciones").insert({
    organization_id: org.id, numero_expediente: `EXP-${rnd()}`, titulo: "L", institucion: "I",
    tipo: "SERVICIOS", estado_id: "FEDERAL", sistema: "COMPRANET",
  }).select("id").single();

  try {
    check("1. sin resultados, no hay pendientes", (await pendientes(lic.id)).length === 0);

    // analisis_bases PENDIENTE
    await insertarResultado(org.id, lic.id, "analisis_bases", "PENDIENTE", null, 0);
    check("2. un resultado PENDIENTE aparece", (await pendientes(lic.id)).length === 1);

    // corrección: versión más nueva APROBADA -> deja de estar pendiente
    await insertarResultado(org.id, lic.id, "analisis_bases", "APROBADO", null, 1000);
    check("3. la versión activa (más nueva) APROBADA desbloquea", (await pendientes(lic.id)).length === 0);

    // otra corrección aún más nueva, PENDIENTE -> vuelve a bloquear
    await insertarResultado(org.id, lic.id, "analisis_bases", "PENDIENTE", null, 2000);
    check("4. una corrección posterior sin revisar vuelve a bloquear", (await pendientes(lic.id)).length === 1);

    // RECHAZADO también desbloquea
    await insertarResultado(org.id, lic.id, "analisis_bases", "RECHAZADO", null, 3000);
    check("5. RECHAZADO (activa) también desbloquea", (await pendientes(lic.id)).length === 0);

    // grupos independientes por (tipo, documento)
    const { data: doc } = await admin.from("documentos").insert({
      licitacion_id: lic.id, tipo_documento: "BASES", nombre: "d.pdf", storage_path: `${lic.id}/d.pdf`,
    }).select("id").single();
    await insertarResultado(org.id, lic.id, "estudio_mercado", "PENDIENTE", null, 4000);
    await insertarResultado(org.id, lic.id, "auditoria_documento", "PENDIENTE", doc.id, 4000);
    const p = await pendientes(lic.id);
    check("6. cada (tipo, documento) es su propio grupo — 2 pendientes distintos", p.length === 2 &&
      new Set(p.map((x) => x.tipo_analisis)).size === 2);

    // otra licitación no interfiere
    const { data: lic2 } = await admin.from("licitaciones").insert({
      organization_id: org.id, numero_expediente: `EXP-${rnd()}`, titulo: "L2", institucion: "I",
      tipo: "SERVICIOS", estado_id: "FEDERAL", sistema: "COMPRANET",
    }).select("id").single();
    check("7. otra licitación sin resultados sigue en cero", (await pendientes(lic2.id)).length === 0);

    // el flag existe
    const { data: flag } = await admin.from("feature_flags").select("key, enabled").eq("key", "ai.gate_aprobacion").single();
    check("8. el flag ai.gate_aprobacion existe y arranca OFF", flag && flag.enabled === false);
  } finally {
    await admin.from("organizations").delete().eq("id", org.id);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
