// P2 · Fase B (B2–B9) — e2e: con su flag async activo, cada ruta de IA
// responde 202 y crea el job del tipo correcto en vez de invocar la Edge
// Function de forma síncrona. (Los flags se activan en playwright.config.)
//
//   npx supabase start
//   npx playwright test tests/e2e/p2-b-async-routes.spec.ts
import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { LOCAL } from "../helpers/local-supabase.mjs";

const SUPABASE_URL = process.env.SUPABASE_URL ?? LOCAL.url;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? LOCAL.serviceRoleKey;

test.skip(SUPABASE_URL.includes("supabase.co"), "local only");

const admin = createClient(SUPABASE_URL, SERVICE_KEY);
const rnd = () => Math.random().toString(36).slice(2, 10);

async function makeOrgWithUser() {
  const { data: org } = await admin.from("organizations").insert({ nombre: `Org ${rnd()}` }).select("id").single();
  const { data: ticket } = await admin.from("signup_tickets").insert({ organization_id: org!.id }).select("id").single();
  const email = `u-${rnd()}@example.org`;
  const password = "TestPassword123!";
  const { error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { nombre: "Test", signup_ticket: ticket!.id },
  });
  if (error) throw error;
  return { orgId: org!.id as string, email, password };
}
async function makeLic(orgId: string) {
  const { data } = await admin.from("licitaciones").insert({
    organization_id: orgId, numero_expediente: `EXP-${rnd()}`, titulo: "L", institucion: "I",
    tipo: "SERVICIOS", estado_id: "FEDERAL", sistema: "COMPRANET",
  }).select("id").single();
  return data!.id as string;
}
async function makeDoc(licId: string, bucket = "documentos-originales", nombre = "bases.pdf") {
  const path = `${licId}/${rnd()}-${nombre}`;
  await admin.storage.from(bucket).upload(path, Buffer.from("%PDF-1.4\n%x\n"), { contentType: "application/pdf" });
  const { data } = await admin.from("documentos").insert({
    licitacion_id: licId, tipo_documento: "BASES", nombre, storage_path: path,
  }).select("id").single();
  return data!.id as string;
}
async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.waitForURL(/\/(dashboard|seleccionar-empresa)/);
}
// Los jobs de tipos reales fallan en local/CI (sin API keys). Se registran
// y se cancelan tras la aserción para no dejarlos consumiendo tiempo del
// worker (que sí corre por cron en algunos entornos).
const jobsCreados: string[] = [];
async function esperaJob(jobId: string) {
  jobsCreados.push(jobId);
  const { data } = await admin.from("jobs").select("tipo, estado, recurso_id").eq("id", jobId).single();
  return data!;
}
test.afterEach(async () => {
  if (jobsCreados.length === 0) return;
  await admin
    .from("jobs")
    .update({ estado: "CANCELLED", finished_at: new Date().toISOString() })
    .in("id", jobsCreados.splice(0));
});

test("analizar-bases -> 202 + job analizar-bases", async ({ page }) => {
  const org = await makeOrgWithUser();
  const licId = await makeLic(org.orgId);
  await login(page, org.email, org.password);
  const res = await page.request.post(`/api/licitaciones/${licId}/analizar-bases`, { data: {} });
  expect(res.status()).toBe(202);
  const b = await res.json();
  expect(b.data.async).toBe(true);
  expect((await esperaJob(b.data.job_id)).tipo).toBe("analizar-bases");
});

test("estudio-mercado -> 202 + job generar-estudio-mercado", async ({ page }) => {
  const org = await makeOrgWithUser();
  const licId = await makeLic(org.orgId);
  await login(page, org.email, org.password);
  const res = await page.request.post(`/api/licitaciones/${licId}/estudio-mercado`, { data: {} });
  expect(res.status()).toBe(202);
  expect((await esperaJob((await res.json()).data.job_id)).tipo).toBe("generar-estudio-mercado");
});

test("junta-aclaraciones/generar -> 202 + job generar-preguntas-junta", async ({ page }) => {
  const org = await makeOrgWithUser();
  const licId = await makeLic(org.orgId);
  await login(page, org.email, org.password);
  const res = await page.request.post(`/api/licitaciones/${licId}/junta-aclaraciones/generar`);
  expect(res.status()).toBe(202);
  expect((await esperaJob((await res.json()).data.job_id)).tipo).toBe("generar-preguntas-junta");
});

test("propuesta-tecnica/generar -> 202 + job generar-propuesta-tecnica", async ({ page }) => {
  const org = await makeOrgWithUser();
  const licId = await makeLic(org.orgId);
  await login(page, org.email, org.password);
  const res = await page.request.post(`/api/licitaciones/${licId}/propuesta-tecnica/generar`);
  expect(res.status()).toBe(202);
  expect((await esperaJob((await res.json()).data.job_id)).tipo).toBe("generar-propuesta-tecnica");
});

test("checklist-items/[itemId]/documento -> 202 + job auditar-documento", async ({ page }) => {
  const org = await makeOrgWithUser();
  const licId = await makeLic(org.orgId);
  const docId = await makeDoc(licId, "documentos-requeridos");
  const { data: item } = await admin.from("checklist_items").insert({
    licitacion_id: licId, categoria: "LEGAL", descripcion: "Acta constitutiva",
  }).select("id").single();
  await login(page, org.email, org.password);
  const res = await page.request.post(`/api/checklist-items/${item!.id}/documento`, { data: { documento_id: docId } });
  expect(res.status()).toBe(202);
  expect((await esperaJob((await res.json()).data.job_id)).tipo).toBe("auditar-documento");
});

test("auditoria/auditar-todos -> 202 + N jobs auditar-documento + 1 auditar-expediente", async ({ page }) => {
  const org = await makeOrgWithUser();
  const licId = await makeLic(org.orgId);
  const docId = await makeDoc(licId, "documentos-requeridos");
  await admin.from("checklist_items").insert([
    { licitacion_id: licId, categoria: "LEGAL", descripcion: "A", documento_id: docId },
    { licitacion_id: licId, categoria: "FISCAL", descripcion: "B", documento_id: docId },
  ]);
  await login(page, org.email, org.password);
  const res = await page.request.post(`/api/licitaciones/${licId}/auditoria/auditar-todos`);
  expect(res.status()).toBe(202);
  const b = await res.json();
  expect(b.data.jobs.length).toBe(2);
  jobsCreados.push(...b.data.jobs);
  expect((await esperaJob(b.data.expediente_job_id)).tipo).toBe("auditar-expediente");
});

test("seguimiento/analizar-fallo -> 202 + job seguimiento-analizar-fallo", async ({ page }) => {
  const org = await makeOrgWithUser();
  const licId = await makeLic(org.orgId);
  const docId = await makeDoc(licId);
  await login(page, org.email, org.password);
  const res = await page.request.post(`/api/licitaciones/${licId}/seguimiento/analizar-fallo`, {
    data: { documento_id: docId },
  });
  expect(res.status()).toBe(202);
  expect((await esperaJob((await res.json()).data.job_id)).tipo).toBe("seguimiento-analizar-fallo");
});

test("empresa-perfil/.../analizar -> 202 + job analizar-documento-corporativo", async ({ page }) => {
  const org = await makeOrgWithUser();
  const { data: ep } = await admin.from("empresa_perfil").insert({ organization_id: org.orgId, razon_social: "ACME" }).select("id").single();
  const path = `${org.orgId}/${rnd()}-acta.pdf`;
  await admin.storage.from("documentos-corporativos").upload(path, Buffer.from("%PDF-1.4\n"), { contentType: "application/pdf" });
  const { data: dc } = await admin.from("documentos_corporativos").insert({
    empresa_perfil_id: ep!.id, organization_id: org.orgId, tipo: "ACTA_CONSTITUTIVA", nombre: "acta.pdf", storage_path: path,
  }).select("id").single();
  await login(page, org.email, org.password);
  const res = await page.request.post(`/api/empresa-perfil/${ep!.id}/documentos/${dc!.id}/analizar`, { data: {} });
  expect(res.status()).toBe(202);
  expect((await esperaJob((await res.json()).data.job_id)).tipo).toBe("analizar-documento-corporativo");
});
