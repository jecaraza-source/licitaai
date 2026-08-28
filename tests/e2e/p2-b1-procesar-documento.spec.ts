// P2 · B1 — e2e del branching de la ruta procesar-documento según el flag
// jobs.async_procesar_documento (activo vía playwright.config env).
//
//   npx supabase start
//   npx playwright test tests/e2e/p2-b1-procesar-documento.spec.ts
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
    user_metadata: { nombre: "Test User", signup_ticket: ticket!.id },
  });
  if (error) throw error;
  return { orgId: org!.id as string, email, password };
}

async function makeLicitacionConDoc(orgId: string) {
  const { data: lic } = await admin.from("licitaciones").insert({
    organization_id: orgId, numero_expediente: `EXP-${rnd()}`, titulo: "Lic", institucion: "I",
    tipo: "SERVICIOS", estado_id: "FEDERAL", sistema: "COMPRANET",
  }).select("id").single();
  const path = `${lic!.id}/${rnd()}-bases.pdf`;
  await admin.storage.from("documentos-originales").upload(path, Buffer.from("%PDF-1.4\n%mock\n"), {
    contentType: "application/pdf",
  });
  const { data: doc } = await admin.from("documentos").insert({
    licitacion_id: lic!.id, tipo_documento: "BASES", nombre: "bases.pdf", storage_path: path,
  }).select("id").single();
  return { licId: lic!.id as string, docId: doc!.id as string };
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/(dashboard|seleccionar-empresa)/);
}

test("con el flag activo, procesar-documento responde 202 y crea un job", async ({ page }) => {
  const org = await makeOrgWithUser();
  const { licId, docId } = await makeLicitacionConDoc(org.orgId);
  await login(page, org.email, org.password);

  const res = await page.request.post(`/api/licitaciones/${licId}/procesar-documento`, {
    data: { documento_id: docId },
  });
  expect(res.status()).toBe(202);
  const body = await res.json();
  expect(body.data.async).toBe(true);
  expect(typeof body.data.job_id).toBe("string");

  const { data: job } = await admin.from("jobs").select("tipo, recurso_id, estado").eq("id", body.data.job_id).single();
  expect(job!.tipo).toBe("procesar-documento");
  expect(job!.recurso_id).toBe(docId);
});

test("procesar-documento es idempotente: dos llamadas -> el mismo job_id", async ({ page }) => {
  const org = await makeOrgWithUser();
  const { licId, docId } = await makeLicitacionConDoc(org.orgId);
  await login(page, org.email, org.password);

  const r1 = await page.request.post(`/api/licitaciones/${licId}/procesar-documento`, { data: { documento_id: docId } });
  const r2 = await page.request.post(`/api/licitaciones/${licId}/procesar-documento`, { data: { documento_id: docId } });
  expect((await r1.json()).data.job_id).toBe((await r2.json()).data.job_id);
});

test("un documento de otra licitación devuelve 404", async ({ page }) => {
  const org = await makeOrgWithUser();
  const a = await makeLicitacionConDoc(org.orgId);
  const b = await makeLicitacionConDoc(org.orgId);
  await login(page, org.email, org.password);

  const res = await page.request.post(`/api/licitaciones/${a.licId}/procesar-documento`, {
    data: { documento_id: b.docId },
  });
  expect(res.status()).toBe(404);
});
