// P2 · seguridad — un usuario autenticado NO puede llamar directamente a
// las funciones del worker (service_role only). Regresión de la corrección
// de grants (migración 20260830001000).
//
//   npx supabase start
//   node tests/integration/p2-grants-worker-fns.test.mjs
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

const DENEGADAS = [
  ["reclamar_jobs", { p_worker_id: "x", p_limite: 1 }],
  ["completar_job", { p_job_id: "00000000-0000-0000-0000-000000000000", p_result_ref: {} }],
  ["fallar_job", { p_job_id: "00000000-0000-0000-0000-000000000000", p_error_seguro: "x" }],
  ["progreso_job", { p_job_id: "00000000-0000-0000-0000-000000000000", p_progreso: 1 }],
  ["marcar_job_cancelado", { p_job_id: "00000000-0000-0000-0000-000000000000" }],
  ["reencolar_step_job", { p_job_id: "00000000-0000-0000-0000-000000000000", p_step: "x" }],
  ["reencolar_por_espera", { p_job_id: "00000000-0000-0000-0000-000000000000", p_segundos: 1 }],
  ["expirar_jobs", {}],
  ["metricas_operacion", {}],
  ["cb_registrar_fallo", { p_provider: "anthropic" }],
  ["cb_registrar_exito", { p_provider: "anthropic" }],
  ["conciliar_presupuesto_ia", { p_organization_id: "00000000-0000-0000-0000-000000000000", p_reserva_id: null, p_tokens_input: 1, p_tokens_output: 1, p_modelo: "x" }],
  ["liberar_reserva_ia", { p_organization_id: "00000000-0000-0000-0000-000000000000", p_reserva_id: "00000000-0000-0000-0000-000000000000" }],
  ["registrar_uso_ia_worker", { p_organization_id: "00000000-0000-0000-0000-000000000000", p_user_id: null, p_funcion: "x", p_modelo: "x", p_input_tokens: 1, p_output_tokens: 1 }],
  ["persistir_resultado_ia", { p_organization_id: "00000000-0000-0000-0000-000000000000", p_recurso_tipo: "licitacion", p_recurso_id: "00000000-0000-0000-0000-000000000000", p_documento_id: null, p_documento_sha256: null, p_tipo_analisis: "x", p_prompt_template_id: null, p_provider: null, p_modelo: null, p_tokens_input: 0, p_tokens_output: 0, p_costo_usd: null, p_latencia_ms: null, p_resultado_json: {}, p_nivel_confianza: null, p_salida_incompleta: false, p_job_id: null }],
  ["disparar_worker", {}],
];

const PERMITIDAS = [
  ["cb_estado", { p_provider: "anthropic" }],
  ["estimar_costo_ia", { p_modelo: "claude-sonnet-5", p_tokens_input: 1, p_tokens_output: 1 }],
];

async function main() {
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

  for (const [fn, args] of DENEGADAS) {
    const { error } = await asUser.rpc(fn, args);
    // "permission denied for function" (42501) o el 404 de PostgREST.
    check(`authenticated NO puede llamar ${fn}()`, !!error, JSON.stringify(error));
  }

  for (const [fn, args] of PERMITIDAS) {
    const { error } = await asUser.rpc(fn, args);
    check(`authenticated SÍ puede llamar ${fn}()`, !error || !/permission denied/i.test(error.message), error?.message);
  }

  try {
    await admin.auth.admin.deleteUser(u.user.id);
    await admin.from("organizations").delete().eq("id", org.id);
  } catch { /* best-effort */ }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
