// P2 · E4/E6 — e2e de los endpoints de salud y del estado de IA para la UI.
//
//   npx supabase start
//   npx playwright test tests/e2e/p2-e-health.spec.ts
import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";

test.skip(SUPABASE_URL.includes("supabase.co"), "local only");
const admin = createClient(SUPABASE_URL, SERVICE_KEY);
const rnd = () => Math.random().toString(36).slice(2, 10);

async function makeOrgWithUser() {
  const { data: org } = await admin.from("organizations").insert({ nombre: `Org ${rnd()}` }).select("id").single();
  const { data: ticket } = await admin.from("signup_tickets").insert({ organization_id: org!.id }).select("id").single();
  const email = `u-${rnd()}@example.org`;
  const password = "TestPassword123!";
  await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { nombre: "Test", signup_ticket: ticket!.id },
  });
  return { orgId: org!.id as string, email, password };
}
async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/(dashboard|seleccionar-empresa)/);
}

test("/api/health responde ok sin auth", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  expect((await res.json()).status).toBe("ok");
});

test("/api/ready comprueba postgres, storage y circuit breakers", async ({ request }) => {
  const res = await request.get("/api/ready");
  expect([200, 503]).toContain(res.status());
  const body = await res.json();
  expect(body.checks.postgres).toBe("ok");
  expect(body.checks.storage).toBe("ok");
});

test("/api/estado-ia refleja el circuit breaker; requiere sesión", async ({ page }) => {
  const noSesion = await page.request.get("/api/estado-ia");
  expect(noSesion.status()).toBe(401);

  const org = await makeOrgWithUser();
  await login(page, org.email, org.password);

  const ok = await page.request.get("/api/estado-ia");
  expect(ok.status()).toBe(200);
  expect((await ok.json()).data.iaDisponible).toBe(true);

  // abrir el circuito de anthropic + activar el flag
  await admin.from("feature_flags").update({ enabled: true }).eq("key", "resiliencia.circuit_breaker");
  await admin.from("provider_health").update({
    estado: "OPEN", abierto_hasta: new Date(Date.now() + 120000).toISOString(),
  }).eq("provider", "anthropic");
  await page.waitForTimeout(3500); // TTL de la caché de flags

  const degradado = await page.request.get("/api/estado-ia");
  const body = await degradado.json();
  expect(body.data.iaDisponible).toBe(false);
  expect(body.data.circuitos.anthropic).toBe("OPEN");

  // restaurar
  await admin.from("provider_health").update({ estado: "CLOSED", abierto_hasta: null, fallos_consecutivos: 0 }).eq("provider", "anthropic");
  await admin.from("feature_flags").update({ enabled: false }).eq("key", "resiliencia.circuit_breaker");
});
