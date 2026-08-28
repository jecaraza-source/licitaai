// P2 · D3/D5 — e2e de la API de resultados de IA (historial + revisión).
//
//   npx supabase start
//   npx playwright test tests/e2e/p2-d1-ai-results.spec.ts
import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";

test.skip(SUPABASE_URL.includes("supabase.co"), "local only");

const admin = createClient(SUPABASE_URL, SERVICE_KEY);
const rnd = () => Math.random().toString(36).slice(2, 10);

async function makeOrgWithUser(rol: "ADMIN" | "VIEWER" = "ADMIN") {
  const { data: org } = await admin.from("organizations").insert({ nombre: `Org ${rnd()}` }).select("id").single();
  const { data: ticket } = await admin.from("signup_tickets").insert({ organization_id: org!.id }).select("id").single();
  const email = `u-${rnd()}@example.org`;
  const password = "TestPassword123!";
  const { data: u, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { nombre: "Test", signup_ticket: ticket!.id },
  });
  if (error) throw error;
  if (rol !== "ADMIN") await admin.from("users").update({ rol }).eq("id", u.user!.id);
  return { orgId: org!.id as string, email, password };
}

async function makeLicitacionConResultados(orgId: string, versiones = 2) {
  const { data: lic } = await admin.from("licitaciones").insert({
    organization_id: orgId, numero_expediente: `EXP-${rnd()}`, titulo: "L", institucion: "I",
    tipo: "SERVICIOS", estado_id: "FEDERAL", sistema: "COMPRANET",
  }).select("id").single();
  const ids: string[] = [];
  for (let v = 1; v <= versiones; v++) {
    const { data } = await admin.rpc("persistir_resultado_ia", {
      p_organization_id: orgId, p_recurso_tipo: "licitacion", p_recurso_id: lic!.id,
      p_documento_id: null, p_documento_sha256: null, p_tipo_analisis: "analisis_bases",
      p_prompt_template_id: "analizar-bases", p_provider: "anthropic", p_modelo: "claude-sonnet-5",
      p_tokens_input: 20000, p_tokens_output: 3000, p_costo_usd: 0.07, p_latencia_ms: 12000,
      p_resultado_json: { version: v }, p_nivel_confianza: "ALTO", p_salida_incompleta: false,
      p_job_id: null, p_citas: [{ pagina: v, seccion: "1", extracto: "x", score: 0.8 }], p_prompt_version: 1,
    });
    ids.push(data as string);
  }
  return { licId: lic!.id as string, resultIds: ids };
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/(dashboard|seleccionar-empresa)/);
}

test("GET ai-results devuelve el historial (append-only) con la versión activa marcada", async ({ page }) => {
  const org = await makeOrgWithUser();
  const { licId } = await makeLicitacionConResultados(org.orgId, 3);
  await login(page, org.email, org.password);

  const res = await page.request.get(`/api/licitaciones/${licId}/ai-results`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.data.total).toBe(3);
  // más reciente primero
  expect(body.data.items[0].resultado_json.version).toBe(3);
  // exactamente una activa por (tipo, documento)
  expect(body.data.items.filter((r: { activo: boolean }) => r.activo).length).toBe(1);
  expect(body.data.items[0].activo).toBe(true);
  // trae citas
  expect(body.data.items[0].ai_result_citations.length).toBe(1);
});

test("POST revision aprueba un resultado; la versión aprobada pasa a ser la activa", async ({ page }) => {
  const org = await makeOrgWithUser();
  const { licId, resultIds } = await makeLicitacionConResultados(org.orgId, 2);
  await login(page, org.email, org.password);

  // aprobar la versión ANTIGUA (v1)
  const rev = await page.request.post(`/api/ai-results/${resultIds[0]}/revision`, {
    data: { estado: "APROBADO" },
  });
  expect(rev.status()).toBe(200);
  expect((await rev.json()).data.estado_aprobacion).toBe("APROBADO");

  const lista = await page.request.get(`/api/licitaciones/${licId}/ai-results`);
  const items = (await lista.json()).data.items;
  const activa = items.find((r: { activo: boolean }) => r.activo);
  expect(activa.id).toBe(resultIds[0]); // la aprobada gana aunque sea más antigua
});

test("POST revision con RECHAZADO y motivo lo registra en la bitácora", async ({ page }) => {
  const org = await makeOrgWithUser();
  const { licId, resultIds } = await makeLicitacionConResultados(org.orgId, 1);
  await login(page, org.email, org.password);

  const rev = await page.request.post(`/api/ai-results/${resultIds[0]}/revision`, {
    data: { estado: "RECHAZADO", motivo: "El monto máximo está mal extraído" },
  });
  expect(rev.status()).toBe(200);

  const { data: log } = await admin
    .from("actividad_log")
    .select("accion, metadata_json")
    .eq("licitacion_id", licId)
    .eq("accion", "ai_result_rechazado");
  expect(log!.length).toBe(1);
  expect(log![0].metadata_json.motivo).toContain("monto máximo");
});

test("un VIEWER no puede revisar resultados (403)", async ({ page }) => {
  const org = await makeOrgWithUser("VIEWER");
  const { resultIds } = await makeLicitacionConResultados(org.orgId, 1);
  await login(page, org.email, org.password);

  const rev = await page.request.post(`/api/ai-results/${resultIds[0]}/revision`, {
    data: { estado: "APROBADO" },
  });
  expect(rev.status()).toBe(403);
});

test("ai-results de otra organización -> 404", async ({ page }) => {
  const orgA = await makeOrgWithUser();
  const orgB = await makeOrgWithUser();
  const { licId } = await makeLicitacionConResultados(orgB.orgId, 1);
  await login(page, orgA.email, orgA.password);

  const res = await page.request.get(`/api/licitaciones/${licId}/ai-results`);
  expect(res.status()).toBe(404);
});
