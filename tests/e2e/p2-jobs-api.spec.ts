// P2 · A4 — end-to-end de la API de jobs (/api/jobs*), a través del stack
// real (sesión por cookie, apiRoute(), RPCs crear_job/cancelar_job, RLS).
// Mismo patrón de login-por-UI que p1-api-layer.spec.ts.
//
// Usage:
//   npx supabase start
//   npx playwright test tests/e2e/p2-jobs-api.spec.ts
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
  const { data: userData, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { nombre: "Test User", signup_ticket: ticket!.id },
  });
  if (error) throw error;
  if (rol !== "ADMIN") await admin.from("users").update({ rol }).eq("id", userData.user!.id);
  return { orgId: org!.id as string, userId: userData.user!.id, email, password };
}

async function makeLicitacion(orgId: string) {
  const { data } = await admin.from("licitaciones").insert({
    organization_id: orgId, numero_expediente: `EXP-${rnd()}`, titulo: "Lic prueba",
    institucion: "Inst", tipo: "SERVICIOS", estado_id: "FEDERAL", sistema: "COMPRANET",
  }).select("id").single();
  return data!.id as string;
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/(dashboard|seleccionar-empresa)/);
}

test("POST /api/jobs crea un job noop y lo devuelve en el sobre uniforme", async ({ page }) => {
  const org = await makeOrgWithUser("ADMIN");
  await login(page, org.email, org.password);

  const res = await page.request.post("/api/jobs", { data: { tipo: "noop", input: { modo: "ok" } } });
  expect(res.status()).toBe(201);
  const body = await res.json();
  expect(body.error).toBeNull();
  expect(body.data.estado).toBe("AUTHORIZED");
  expect(body.data.tipo).toBe("noop");
  expect(body.data).not.toHaveProperty("input_json");
  expect(typeof body.meta.request_id).toBe("string");
});

test("POST /api/jobs es idempotente por idempotency_key", async ({ page }) => {
  const org = await makeOrgWithUser("ADMIN");
  await login(page, org.email, org.password);
  const key = `idem-${rnd()}`;

  const r1 = await page.request.post("/api/jobs", { data: { tipo: "noop", idempotency_key: key } });
  const r2 = await page.request.post("/api/jobs", { data: { tipo: "noop", idempotency_key: key } });
  expect(r1.status()).toBe(201);
  expect(r2.status()).toBe(200);
  expect((await r1.json()).data.id).toBe((await r2.json()).data.id);
});

test("POST /api/jobs con un recurso de otra organización devuelve 404", async ({ page }) => {
  const orgA = await makeOrgWithUser("ADMIN");
  const orgB = await makeOrgWithUser("ADMIN");
  const licB = await makeLicitacion(orgB.orgId);
  await login(page, orgA.email, orgA.password);

  const res = await page.request.post("/api/jobs", {
    data: { tipo: "analizar-bases", recurso_tipo: "licitacion", recurso_id: licB },
  });
  expect(res.status()).toBe(404);
  expect((await res.json()).error.code).toBe("NOT_FOUND");
});

test("POST /api/jobs con body inválido devuelve 400 VALIDATION_ERROR", async ({ page }) => {
  const org = await makeOrgWithUser("ADMIN");
  await login(page, org.email, org.password);

  const res = await page.request.post("/api/jobs", { data: { tipo: "no-existe" } });
  expect(res.status()).toBe(400);
  expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
});

test("un VIEWER no puede crear jobs (403)", async ({ page }) => {
  const org = await makeOrgWithUser("VIEWER");
  await login(page, org.email, org.password);

  const res = await page.request.post("/api/jobs", { data: { tipo: "noop" } });
  expect(res.status()).toBe(403);
});

test("GET /api/jobs/:id devuelve el estado del job; 404 si no existe o es de otra org", async ({ page }) => {
  const orgA = await makeOrgWithUser("ADMIN");
  const orgB = await makeOrgWithUser("ADMIN");
  await login(page, orgA.email, orgA.password);

  const creado = await page.request.post("/api/jobs", { data: { tipo: "noop" } });
  const jobId = (await creado.json()).data.id;

  const ok = await page.request.get(`/api/jobs/${jobId}`);
  expect(ok.status()).toBe(200);
  expect((await ok.json()).data.id).toBe(jobId);

  const noExiste = await page.request.get("/api/jobs/00000000-0000-0000-0000-000000000000");
  expect(noExiste.status()).toBe(404);

  // job de org A visto por org B
  const { data: sessionB } = await createClient(SUPABASE_URL, process.env.SUPABASE_ANON_KEY ?? "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH")
    .auth.signInWithPassword({ email: orgB.email, password: orgB.password });
  void sessionB;
  await page.context().clearCookies();
  await login(page, orgB.email, orgB.password);
  const ajeno = await page.request.get(`/api/jobs/${jobId}`);
  expect(ajeno.status()).toBe(404);
});

test("POST /api/jobs/:id/cancel cancela un job AUTHORIZED", async ({ page }) => {
  const org = await makeOrgWithUser("ADMIN");
  await login(page, org.email, org.password);

  const creado = await page.request.post("/api/jobs", { data: { tipo: "noop" } });
  const jobId = (await creado.json()).data.id;

  const cancel = await page.request.post(`/api/jobs/${jobId}/cancel`);
  expect(cancel.status()).toBe(200);
  expect((await cancel.json()).data.estado).toBe("CANCELLED");
});

test("GET /api/jobs lista los jobs de la organización, paginado", async ({ page }) => {
  const org = await makeOrgWithUser("ADMIN");
  await login(page, org.email, org.password);
  for (let i = 0; i < 3; i++) await page.request.post("/api/jobs", { data: { tipo: "noop" } });

  const res = await page.request.get("/api/jobs?pageSize=2");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.data.items.length).toBe(2);
  expect(body.data.total).toBeGreaterThanOrEqual(3);
  expect(body.data.pageSize).toBe(2);
});

test("sin sesión, /api/jobs devuelve 401", async ({ page }) => {
  const res = await page.request.get("/api/jobs");
  expect(res.status()).toBe(401);
});
