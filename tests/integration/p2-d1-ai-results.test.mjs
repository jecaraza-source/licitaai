// P2 · D1–D3 — integration tests para el versionado de resultados de IA
// (migración 20260828010000_p2_d1_ai_results.sql).
//
//   npx supabase start
//   node tests/integration/p2-d1-ai-results.test.mjs
import { createClient } from "@supabase/supabase-js";
import { LOCAL } from "../helpers/local-supabase.mjs";

const URL = process.env.SUPABASE_URL ?? LOCAL.url;
const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? LOCAL.anonKey;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? LOCAL.serviceRoleKey;

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

async function makeOrgWithUser(rol = "ADMIN") {
  const { data: org } = await admin.from("organizations").insert({ nombre: `Org ${rnd()}` }).select("id").single();
  const { data: ticket } = await admin.from("signup_tickets").insert({ organization_id: org.id }).select("id").single();
  const email = `u-${rnd()}@example.org`;
  const { data: u } = await admin.auth.admin.createUser({
    email, password: "TestPassword123!", email_confirm: true,
    user_metadata: { nombre: "T", signup_ticket: ticket.id },
  });
  if (rol !== "ADMIN") await admin.from("users").update({ rol }).eq("id", u.user.id);
  const anon = createClient(URL, ANON_KEY);
  const { data: sess } = await anon.auth.signInWithPassword({ email, password: "TestPassword123!" });
  const asUser = createClient(URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${sess.session.access_token}` } },
  });
  return { orgId: org.id, userId: u.user.id, asUser };
}
async function makeLicitacion(orgId) {
  const { data } = await admin.from("licitaciones").insert({
    organization_id: orgId, numero_expediente: `EXP-${rnd()}`, titulo: "L", institucion: "I",
    tipo: "SERVICIOS", estado_id: "FEDERAL", sistema: "COMPRANET",
  }).select("id").single();
  return data.id;
}

const persistir = (orgId, licId, jobId, extra = {}) => admin.rpc("persistir_resultado_ia", {
  p_organization_id: orgId, p_recurso_tipo: "licitacion", p_recurso_id: licId,
  p_documento_id: null, p_documento_sha256: null, p_tipo_analisis: "analisis_bases",
  p_prompt_template_id: "analizar-bases", p_provider: "anthropic", p_modelo: "claude-sonnet-5",
  p_tokens_input: 20000, p_tokens_output: 3000, p_costo_usd: 0.07, p_latencia_ms: 12000,
  p_resultado_json: { objeto_contrato: "servicios de limpieza", version: 1 },
  p_nivel_confianza: "ALTO", p_salida_incompleta: false, p_job_id: jobId,
  p_citas: [], p_prompt_version: 1, ...extra,
});

async function main() {
  const orgA = await makeOrgWithUser();
  const orgB = await makeOrgWithUser();
  const viewer = await makeOrgWithUser("VIEWER");
  const licA = await makeLicitacion(orgA.orgId);
  const licV = await makeLicitacion(viewer.orgId);

  // 1. persistir_resultado_ia inserta la fila + citas.
  let r1;
  {
    const { data, error } = await persistir(orgA.orgId, licA, null, {
      p_citas: [
        { document_chunk_id: null, documento_id: null, pagina: 4, seccion: "3.1", extracto: "El licitante deberá...", score: 0.82 },
        { pagina: 7, seccion: "5", extracto: "Garantía de cumplimiento del 10%", score: 0.75 },
      ],
    });
    r1 = data;
    check("1. persistir_resultado_ia devuelve un id", !error && typeof data === "string", error?.message);
    const { data: row } = await admin.from("ai_results").select("*").eq("id", data).single();
    check("2. la fila tiene el resultado, tipo, prompt y estado PENDIENTE", row.tipo_analisis === "analisis_bases" && row.estado_aprobacion === "PENDIENTE" && row.resultado_json.version === 1 && row.reemplaza_a === null);
    const { data: citas } = await admin.from("ai_result_citations").select("pagina, score").eq("ai_result_id", data);
    check("3. se insertaron las 2 citas", (citas ?? []).length === 2 && citas.some((c) => c.pagina === 4));
  }

  // 2. re-analizar -> fila nueva con reemplaza_a, la anterior intacta.
  let r2;
  {
    const { data } = await persistir(orgA.orgId, licA, null, {
      p_resultado_json: { objeto_contrato: "servicios de limpieza y jardinería", version: 2 },
    });
    r2 = data;
    const { data: nueva } = await admin.from("ai_results").select("reemplaza_a, resultado_json").eq("id", data).single();
    check("4. la fila nueva apunta a la anterior con reemplaza_a", nueva.reemplaza_a === r1 && nueva.resultado_json.version === 2);
    const { data: anterior } = await admin.from("ai_results").select("resultado_json").eq("id", r1).single();
    check("5. la fila anterior NO se modificó (append-only)", anterior.resultado_json.version === 1);
  }

  // 3. RLS entre organizaciones.
  {
    const { data: verB } = await orgB.asUser.from("ai_results").select("id").eq("id", r1);
    check("6. org B no ve los ai_results de org A", (verB ?? []).length === 0);
    const { data: citasB } = await orgB.asUser.from("ai_result_citations").select("id").eq("ai_result_id", r1);
    check("7. org B no ve las citas de org A", (citasB ?? []).length === 0);
    const { data: verA } = await orgA.asUser.from("ai_results").select("id").eq("id", r1);
    check("8. org A ve sus propios ai_results", (verA ?? []).length === 1);
  }

  // 4. prompt_templates: RLS deniega a authenticated.
  {
    const { data } = await orgA.asUser.from("prompt_templates").select("id");
    check("9. prompt_templates no es legible por un usuario (solo service_role)", (data ?? []).length === 0);
    const { data: seed } = await admin.from("prompt_templates").select("id");
    check("10. el seed de prompt_templates existe (visto por service_role)", (seed ?? []).length >= 2);
  }

  // 5. aprobar_resultado_ia.
  {
    const { data, error } = await orgA.asUser.rpc("aprobar_resultado_ia", { p_result_id: r2, p_estado: "APROBADO" });
    check("11. un rol de escritura puede APROBAR un resultado de su organización", !error && data.estado_aprobacion === "APROBADO" && data.aprobado_por === orgA.userId, error?.message);

    const { data: r0 } = await admin.from("ai_results").select("resultado_json").eq("id", r2).single();
    check("12. aprobar no tocó resultado_json", r0.resultado_json.version === 2);

    const { error: eAjeno } = await orgB.asUser.rpc("aprobar_resultado_ia", { p_result_id: r2, p_estado: "RECHAZADO" });
    check("13. otra organización no puede aprobar/rechazar (Resultado no encontrado)", !!eAjeno && /no encontrado/i.test(eAjeno.message));
  }

  // 6. VIEWER no puede aprobar.
  {
    const { data: rv } = await persistir(viewer.orgId, licV, null);
    const { error } = await viewer.asUser.rpc("aprobar_resultado_ia", { p_result_id: rv, p_estado: "APROBADO" });
    check("14. un VIEWER no puede aprobar un resultado (RLS is_write_role)", !!error && /no encontrado/i.test(error.message));
  }

  // 7. estado inválido.
  {
    const { error } = await orgA.asUser.rpc("aprobar_resultado_ia", { p_result_id: r2, p_estado: "QUIZAS" });
    check("15. aprobar_resultado_ia rechaza un estado inválido", !!error);
  }

  // limpieza
  try {
    for (const o of [orgA, orgB, viewer]) {
      await admin.from("ai_results").delete().eq("organization_id", o.orgId);
      await admin.auth.admin.deleteUser(o.userId);
      await admin.from("organizations").delete().eq("id", o.orgId);
    }
  } catch { /* best-effort */ }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
