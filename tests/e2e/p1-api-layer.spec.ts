// P1.1 — end-to-end tests for the shared API layer (src/lib/api/*), driven
// through its first migrated route (/api/licitaciones/[id]) so the whole
// chain (cookie-based session, requireApiContext, Zod param/body
// validation, role gating, the {data,error,meta} envelope) is exercised
// exactly the way a browser would hit it — not just unit-tested in
// isolation. Same login-via-real-UI pattern as p0-efirma.spec.ts, since
// hand-constructing Supabase SSR session cookies proved unreliable there.
//
// Usage:
//   npx supabase start
//   npx playwright test tests/e2e/p1-api-layer.spec.ts
import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { LOCAL } from "../helpers/local-supabase.mjs";

const SUPABASE_URL = process.env.SUPABASE_URL ?? LOCAL.url;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? LOCAL.serviceRoleKey;

test.skip(
  SUPABASE_URL.includes("supabase.co"),
  "Refusing to run against a hosted/remote project — local only.",
);

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

function rnd() {
  return Math.random().toString(36).slice(2, 10);
}

async function makeOrgWithUser(rol: "ADMIN" | "VIEWER" = "ADMIN") {
  const { data: org } = await admin.from("organizations").insert({ nombre: `Org ${rnd()}` }).select("id").single();
  const { data: ticket } = await admin
    .from("signup_tickets")
    .insert({ organization_id: org!.id })
    .select("id")
    .single();
  const email = `u-${rnd()}@example.org`;
  const password = "TestPassword123!";
  const { data: userData, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nombre: "Test User", signup_ticket: ticket!.id },
  });
  if (error) throw error;
  if (rol !== "ADMIN") {
    await admin.from("users").update({ rol }).eq("id", userData.user!.id);
  }
  return { orgId: org!.id as string, userId: userData.user!.id, email, password };
}

async function makeLicitacion(orgId: string) {
  const { data: lic } = await admin
    .from("licitaciones")
    .insert({
      organization_id: orgId,
      numero_expediente: `EXP-${rnd()}`,
      titulo: "Licitación de prueba",
      institucion: "Institución de prueba",
      tipo: "SERVICIOS",
      estado_id: "FEDERAL",
      sistema: "COMPRANET",
    })
    .select("id")
    .single();
  return lic!.id as string;
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/(dashboard|seleccionar-empresa)/);
}

test("GET returns the licitación wrapped in the uniform {data,error,meta} envelope", async ({ page }) => {
  const org = await makeOrgWithUser("ADMIN");
  const licId = await makeLicitacion(org.orgId);
  await login(page, org.email, org.password);

  const res = await page.request.get(`/api/licitaciones/${licId}`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.error).toBeNull();
  expect(body.data.id).toBe(licId);
  expect(typeof body.meta.request_id).toBe("string");
  expect(body.meta.request_id.length).toBeGreaterThan(0);
});

test("GET with a malformed id returns 400 VALIDATION_ERROR instead of a raw Postgres error", async ({ page }) => {
  const org = await makeOrgWithUser("ADMIN");
  await login(page, org.email, org.password);

  const res = await page.request.get(`/api/licitaciones/no-es-un-uuid`);
  expect(res.status()).toBe(400);
  const body = await res.json();
  expect(body.data).toBeNull();
  expect(body.error.code).toBe("VALIDATION_ERROR");
  expect(body.error.message).not.toContain("invalid input syntax"); // no leaked Postgres message
});

test("GET with a well-formed but nonexistent id returns 404 NOT_FOUND, not a raw Postgres error", async ({ page }) => {
  const org = await makeOrgWithUser("ADMIN");
  await login(page, org.email, org.password);

  const res = await page.request.get(`/api/licitaciones/00000000-0000-0000-0000-000000000000`);
  expect(res.status()).toBe(404);
  const body = await res.json();
  expect(body.error.code).toBe("NOT_FOUND");
});

test("GET without a session returns 401 UNAUTHENTICATED", async ({ page }) => {
  const org = await makeOrgWithUser("ADMIN");
  const licId = await makeLicitacion(org.orgId);

  const res = await page.request.get(`/api/licitaciones/${licId}`);
  expect(res.status()).toBe(401);
  const body = await res.json();
  expect(body.error.code).toBe("UNAUTHENTICATED");
});

test("GET a licitación belonging to another organization returns 404, never leaking that it exists", async ({ page }) => {
  const orgA = await makeOrgWithUser("ADMIN");
  const orgB = await makeOrgWithUser("ADMIN");
  const licB = await makeLicitacion(orgB.orgId);
  await login(page, orgA.email, orgA.password);

  const res = await page.request.get(`/api/licitaciones/${licB}`);
  expect(res.status()).toBe(404);
});

test("PUT as ADMIN with a valid partial body updates the licitación", async ({ page }) => {
  const org = await makeOrgWithUser("ADMIN");
  const licId = await makeLicitacion(org.orgId);
  await login(page, org.email, org.password);

  const res = await page.request.put(`/api/licitaciones/${licId}`, {
    data: { titulo: "Título actualizado" },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.data.titulo).toBe("Título actualizado");
});

test("PUT with an invalid body returns 400 VALIDATION_ERROR with field-level Zod details", async ({ page }) => {
  const org = await makeOrgWithUser("ADMIN");
  const licId = await makeLicitacion(org.orgId);
  await login(page, org.email, org.password);

  const res = await page.request.put(`/api/licitaciones/${licId}`, {
    data: { tipo: "TIPO_QUE_NO_EXISTE" },
  });
  expect(res.status()).toBe(400);
  const body = await res.json();
  expect(body.error.code).toBe("VALIDATION_ERROR");
  expect(body.error.details).toBeTruthy();
});

test("PUT as VIEWER is rejected with 403 FORBIDDEN before touching the database", async ({ page }) => {
  const org = await makeOrgWithUser("VIEWER");
  const licId = await makeLicitacion(org.orgId);
  await login(page, org.email, org.password);

  const res = await page.request.put(`/api/licitaciones/${licId}`, {
    data: { titulo: "Intento de VIEWER" },
  });
  expect(res.status()).toBe(403);
  const body = await res.json();
  expect(body.error.code).toBe("FORBIDDEN");

  const { data: sinCambios } = await admin.from("licitaciones").select("titulo").eq("id", licId).single();
  expect(sinCambios!.titulo).not.toBe("Intento de VIEWER");
});

test("DELETE as VIEWER is rejected with 403 and the record survives", async ({ page }) => {
  const org = await makeOrgWithUser("VIEWER");
  const licId = await makeLicitacion(org.orgId);
  await login(page, org.email, org.password);

  const res = await page.request.delete(`/api/licitaciones/${licId}`);
  expect(res.status()).toBe(403);

  const { data: sigueViva } = await admin.from("licitaciones").select("id").eq("id", licId).maybeSingle();
  expect(sigueViva).not.toBeNull();
});

test("DELETE as ADMIN removes the record and returns the uniform envelope", async ({ page }) => {
  const org = await makeOrgWithUser("ADMIN");
  const licId = await makeLicitacion(org.orgId);
  await login(page, org.email, org.password);

  const res = await page.request.delete(`/api/licitaciones/${licId}`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.data.ok).toBe(true);

  const { data: borrada } = await admin.from("licitaciones").select("id").eq("id", licId).maybeSingle();
  expect(borrada).toBeNull();
});
