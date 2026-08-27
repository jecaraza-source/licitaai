// P2 · I6/I7 — e2e: página de estado pública, aceptación de términos,
// métricas de valor, historial de actividad.
//
//   npx supabase start
//   npx playwright test tests/e2e/p2-i6-producto.spec.ts
import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";

test.skip(SUPABASE_URL.includes("supabase.co"), "local only");
const admin = createClient(SUPABASE_URL, SERVICE_KEY);
const rnd = () => Math.random().toString(36).slice(2, 10);

async function makeOrgWithUser(rol: "ADMIN" | "VIEWER" | "MANAGER" = "ADMIN") {
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
  return { orgId: org!.id as string, userId: u.user!.id as string, email, password };
}
async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/(dashboard|seleccionar-empresa)/);
}

test("/estado y /api/estado son públicos y reportan los servicios", async ({ request }) => {
  const api = await request.get("/api/estado");
  expect(api.status()).toBe(200);
  const body = await api.json();
  expect(["operativo", "degradado", "incidente", "desconocido"]).toContain(body.estado);
  expect(Array.isArray(body.servicios)).toBe(true);

  const pagina = await request.get("/estado");
  expect(pagina.status()).toBe(200);
});

test("POST /api/terminos/aceptar registra la aceptación + auditoría", async ({ page }) => {
  const org = await makeOrgWithUser();
  await login(page, org.email, org.password);

  const res = await page.request.post("/api/terminos/aceptar", { data: { version: "2026-08-27" } });
  expect(res.status()).toBe(200);

  const { data: user } = await admin.from("users").select("terminos_version").eq("id", org.userId).single();
  expect(user!.terminos_version).toBe("2026-08-27");

  const { data: audit } = await admin
    .from("audit_log")
    .select("accion")
    .eq("organization_id", org.orgId)
    .eq("accion", "terminos_aceptados");
  expect(audit!.length).toBe(1);
});

test("/api/organizacion/metricas-valor: 200 para ADMIN/MANAGER, 403 para VIEWER", async ({ page }) => {
  const adminOrg = await makeOrgWithUser("ADMIN");
  await login(page, adminOrg.email, adminOrg.password);
  const ok = await page.request.get("/api/organizacion/metricas-valor");
  expect(ok.status()).toBe(200);
  const body = await ok.json();
  expect(body.data).toHaveProperty("tasa_aceptacion_humana_pct");
  expect(body.data).toHaveProperty("costo_ia_por_expediente_usd");

  await page.context().clearCookies();
  const viewer = await makeOrgWithUser("VIEWER");
  await login(page, viewer.email, viewer.password);
  const denegado = await page.request.get("/api/organizacion/metricas-valor");
  expect(denegado.status()).toBe(403);
});

test("/api/organizacion/actividad devuelve actividad + bitácora de auditoría", async ({ page }) => {
  const org = await makeOrgWithUser();
  await login(page, org.email, org.password);
  await page.request.post("/api/terminos/aceptar", { data: { version: "2026-08-27" } });

  const res = await page.request.get("/api/organizacion/actividad");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(Array.isArray(body.data.actividad)).toBe(true);
  expect(Array.isArray(body.data.auditoria)).toBe(true);
  expect(body.data.auditoria.some((a: { accion: string }) => a.accion === "terminos_aceptados")).toBe(true);
});
