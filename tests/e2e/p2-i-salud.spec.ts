// P2 · I — e2e del dashboard de salud y el monitoreo.
// PLATFORM_ADMIN_EMAILS y CRON_SECRET se fijan en playwright.config.
//
//   npx supabase start
//   npx playwright test tests/e2e/p2-i-salud.spec.ts
import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { LOCAL } from "../helpers/local-supabase.mjs";

const SUPABASE_URL = process.env.SUPABASE_URL ?? LOCAL.url;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? LOCAL.serviceRoleKey;
const ADMIN_EMAIL = "platform-admin-e2e@example.org";
const CRON_SECRET = "e2e-cron-secret-0123456789abcdef";

test.skip(SUPABASE_URL.includes("supabase.co"), "local only");
const admin = createClient(SUPABASE_URL, SERVICE_KEY);
const rnd = () => Math.random().toString(36).slice(2, 10);

async function usuario(email: string) {
  const { data: existentes } = await admin.auth.admin.listUsers();
  const ya = existentes.users.find((u) => u.email === email);
  if (ya) return { id: ya.id, email, password: "TestPassword123!" };
  const { data: org } = await admin.from("organizations").insert({ nombre: `Org ${rnd()}` }).select("id").single();
  const { data: ticket } = await admin.from("signup_tickets").insert({ organization_id: org!.id }).select("id").single();
  const { data: creado, error } = await admin.auth.admin.createUser({
    email, password: "TestPassword123!", email_confirm: true,
    user_metadata: { nombre: "Admin", signup_ticket: ticket!.id },
  });
  if (error) throw error;
  return { id: creado.user!.id, email, password: "TestPassword123!" };
}
async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.waitForURL(/\/(dashboard|seleccionar-empresa)/);
}

test("/api/admin/salud: 401 sin sesión, 403 si no es platform admin", async ({ page }) => {
  const sinSesion = await page.request.get("/api/admin/salud");
  expect(sinSesion.status()).toBe(401);

  const otro = await usuario(`u-${rnd()}@example.org`);
  await login(page, otro.email, otro.password);
  const noAdmin = await page.request.get("/api/admin/salud");
  expect(noAdmin.status()).toBe(403);
});

test("/api/admin/salud: 200 + métricas para un platform admin", async ({ page }) => {
  const adm = await usuario(ADMIN_EMAIL);
  // Admin de plataforma: fila en public.platform_admins (reemplaza la
  // allowlist PLATFORM_ADMIN_EMAILS por variable de entorno). upsert por si
  // el test corre más de una vez contra la misma BD local.
  const { error: upsertError } = await admin
    .from("platform_admins")
    .upsert({ id: adm.id, email: adm.email, nombre: "Admin E2E", rol: "ADMIN" });
  if (upsertError) throw upsertError;
  await login(page, adm.email, adm.password);

  const res = await page.request.get("/api/admin/salud");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.data.jobs).toBeDefined();
  expect(Array.isArray(body.data.circuit_breakers)).toBe(true);
  expect(body.data.circuit_breakers.length).toBeGreaterThanOrEqual(3);
  expect(body.data.consumo_ia).toBeDefined();
});

test("/api/cron/monitoreo: requiere el secreto y clasifica severidad", async ({ request }) => {
  const sinSecreto = await request.get("/api/cron/monitoreo");
  expect(sinSecreto.status()).toBe(401);

  // provocar una SEV2: circuit breaker abierto
  await admin.from("provider_health").update({
    estado: "OPEN", abierto_hasta: new Date(Date.now() + 120000).toISOString(),
  }).eq("provider", "openai");

  const res = await request.get("/api/cron/monitoreo", {
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.ok).toBe(true);
  expect(body.severidad).toBe("SEV2");
  expect(body.alertas.some((a: { msg: string }) => a.msg.includes("openai"))).toBe(true);

  await admin.from("provider_health").update({ estado: "CLOSED", abierto_hasta: null, fallos_consecutivos: 0 }).eq("provider", "openai");
});
