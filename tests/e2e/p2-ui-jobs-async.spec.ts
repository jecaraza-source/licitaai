// P2 — la UI maneja las respuestas 202 de las operaciones de IA (flags
// `jobs.async_*`): espera al job, muestra su estado y solo anuncia el
// resultado cuando termina (o el error cuando falla).
//
// La red se intercepta (POST de la operación + consulta del estado del job):
// así el test no depende de un worker ni de llaves de IA, y ejercita
// exactamente la lógica de la pantalla. Que la ruta real responda 202 y cree
// el job ya lo cubre p2-b-async-routes.spec.ts.
//
//   npx supabase start
//   npx playwright test tests/e2e/p2-ui-jobs-async.spec.ts
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
    email,
    password,
    email_confirm: true,
    user_metadata: { nombre: "Test", signup_ticket: ticket!.id },
  });
  if (error) throw error;
  return { orgId: org!.id as string, email, password };
}

async function makeLic(orgId: string) {
  const { data } = await admin
    .from("licitaciones")
    .insert({
      organization_id: orgId,
      numero_expediente: `EXP-${rnd()}`,
      titulo: "L",
      institucion: "I",
      tipo: "SERVICIOS",
      estado_id: "FEDERAL",
      sistema: "COMPRANET",
    })
    .select("id")
    .single();
  return data!.id as string;
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.waitForURL(/\/(dashboard|seleccionar-empresa)/);
}

const jobBase = {
  tipo: "x",
  recurso_tipo: "licitacion",
  recurso_id: null,
  prioridad: 100,
  progreso: 0,
  progreso_detalle: null,
  step_actual: null,
  intentos: 1,
  max_intentos: 3,
  provider: null,
  modelo: null,
  tokens_input: null,
  tokens_output: null,
  costo_real_usd: null,
  result_ref: null,
  error_seguro: null,
  created_at: new Date().toISOString(),
};

/** Intercepta GET /api/jobs/:id devolviendo, en orden, los estados dados
 * (el último se repite). Devuelve cuántas consultas se hicieron. */
async function simularJob(page: Page, jobId: string, estados: Array<Record<string, unknown>>) {
  let n = 0;
  await page.route(`**/api/jobs/${jobId}`, async (route) => {
    const paso = estados[Math.min(n++, estados.length - 1)];
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { ...jobBase, id: jobId, ...paso } }) });
  });
  return () => n;
}

test("propuesta técnica: con el flag async espera al job y solo entonces anuncia el resultado", async ({ page }) => {
  test.setTimeout(60_000);
  const org = await makeOrgWithUser();
  const licId = await makeLic(org.orgId);
  const jobId = "11111111-1111-4111-8111-111111111111";

  await page.route(`**/api/licitaciones/${licId}/propuesta-tecnica/generar`, (route) =>
    route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({ data: { job_id: jobId, estado: "PENDING", async: true } }),
    }),
  );
  const consultas = await simularJob(page, jobId, [
    { estado: "RUNNING", progreso: 40, progreso_detalle: "Redactando secciones" },
    { estado: "COMPLETED", progreso: 100 },
  ]);

  await login(page, org.email, org.password);
  await page.goto(`/licitaciones/${licId}?tab=propuesta-tecnica`);
  await page.getByRole("button", { name: "Generar propuesta técnica con IA" }).click();

  // Mientras el job corre: muestra su estado y NO anuncia éxito todavía.
  await expect(page.getByRole("status").filter({ hasText: "Procesando" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Redactando secciones")).toBeVisible();
  await expect(page.getByText("Propuesta técnica generada")).toHaveCount(0);

  // Al completar: anuncia el resultado.
  await expect(page.getByText("Propuesta técnica generada")).toBeVisible({ timeout: 20_000 });
  expect(consultas()).toBeGreaterThanOrEqual(2);
});

test("propuesta técnica: si el job falla muestra el error seguro, no un éxito", async ({ page }) => {
  test.setTimeout(60_000);
  const org = await makeOrgWithUser();
  const licId = await makeLic(org.orgId);
  const jobId = "22222222-2222-4222-8222-222222222222";

  await page.route(`**/api/licitaciones/${licId}/propuesta-tecnica/generar`, (route) =>
    route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({ data: { job_id: jobId, estado: "PENDING", async: true } }),
    }),
  );
  await simularJob(page, jobId, [{ estado: "FAILED", error_seguro: "El proveedor de IA no respondió" }]);

  await login(page, org.email, org.password);
  await page.goto(`/licitaciones/${licId}?tab=propuesta-tecnica`);
  await page.getByRole("button", { name: "Generar propuesta técnica con IA" }).click();

  await expect(page.getByText("No se pudo generar la propuesta técnica")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("El proveedor de IA no respondió").first()).toBeVisible();
  await expect(page.getByText("Propuesta técnica generada")).toHaveCount(0);
  // El botón vuelve a estar disponible para reintentar.
  await expect(page.getByRole("button", { name: "Generar propuesta técnica con IA" })).toBeEnabled();
});

/** Intercepta la consulta por lote que hace el cliente a PostgREST. */
async function simularLote(page: Page, rondas: Array<Array<{ id: string; estado: string }>>) {
  let n = 0;
  await page.route("**/rest/v1/jobs*", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const filas = rondas[Math.min(n++, rondas.length - 1)];
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(filas) });
  });
}

test("auditar todos: con el flag async muestra el avance del lote y anuncia al terminar", async ({ page }) => {
  test.setTimeout(90_000);
  const org = await makeOrgWithUser();
  const licId = await makeLic(org.orgId);
  const [a, b, e] = [
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  ];

  await page.route(`**/api/licitaciones/${licId}/auditoria/auditar-todos`, (route) =>
    route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({ data: { jobs: [a, b], expediente_job_id: e, async: true } }),
    }),
  );
  await simularLote(page, [
    [{ id: a, estado: "COMPLETED" }, { id: b, estado: "RUNNING" }, { id: e, estado: "PENDING" }],
    [{ id: a, estado: "COMPLETED" }, { id: b, estado: "COMPLETED" }, { id: e, estado: "COMPLETED" }],
  ]);

  await login(page, org.email, org.password);
  await page.goto(`/licitaciones/${licId}?tab=auditoria`);
  await page.getByRole("button", { name: "Auditar todos los documentos con IA" }).click();

  await expect(page.getByRole("button", { name: /Auditando… 1\/3/ })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Auditoría del expediente actualizada")).toHaveCount(0);
  await expect(page.getByText("Auditoría del expediente actualizada")).toBeVisible({ timeout: 20_000 });
});

test("auditar todos: si una tarea del lote falla avisa que fue parcial", async ({ page }) => {
  test.setTimeout(90_000);
  const org = await makeOrgWithUser();
  const licId = await makeLic(org.orgId);
  const [a, e] = ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"];

  await page.route(`**/api/licitaciones/${licId}/auditoria/auditar-todos`, (route) =>
    route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({ data: { jobs: [a], expediente_job_id: e, async: true } }),
    }),
  );
  await simularLote(page, [[{ id: a, estado: "FAILED" }, { id: e, estado: "COMPLETED" }]]);

  await login(page, org.email, org.password);
  await page.goto(`/licitaciones/${licId}?tab=auditoria`);
  await page.getByRole("button", { name: "Auditar todos los documentos con IA" }).click();

  await expect(page.getByText(/Auditoría parcial: 1 tarea\(s\)/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Auditoría del expediente actualizada")).toHaveCount(0);
});
