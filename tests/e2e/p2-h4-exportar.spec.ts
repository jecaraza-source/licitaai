// P2 · H4 — e2e: ruta /api/organizacion/exportar (autoservicio de export).
//
//   npx supabase start
//   npx playwright test tests/e2e/p2-h4-exportar.spec.ts
import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { LOCAL } from "../helpers/local-supabase.mjs";

const SUPABASE_URL = process.env.SUPABASE_URL ?? LOCAL.url;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? LOCAL.serviceRoleKey;

test.skip(SUPABASE_URL.includes("supabase.co"), "local only");
const admin = createClient(SUPABASE_URL, SERVICE_KEY);
const rnd = () => Math.random().toString(36).slice(2, 10);

async function makeOrgWithUser(rol: "ADMIN" | "VIEWER" = "ADMIN") {
  const { data: org } = await admin.from("organizations").insert({ nombre: `Org ${rnd()}` }).select("id").single();
  const { data: ticket } = await admin.from("signup_tickets").insert({ organization_id: org!.id }).select("id").single();
  const email = `u-${rnd()}@example.org`;
  const password = "TestPassword123!";
  const { data: u, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { nombre: "Test", signup_ticket: ticket!.id },
  });
  if (error) throw error;
  if (rol !== "ADMIN") await admin.from("users").update({ rol }).eq("id", u.user!.id);
  return { orgId: org!.id as string, email, password };
}
async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/(dashboard|seleccionar-empresa)/);
}

test("ADMIN puede encolar un export; VIEWER recibe 403", async ({ page }) => {
  const adminOrg = await makeOrgWithUser("ADMIN");
  await login(page, adminOrg.email, adminOrg.password);

  const res = await page.request.post("/api/organizacion/exportar");
  expect(res.status()).toBe(202);
  const body = await res.json();
  expect(body.data.tipo).toBe("exportar-organizacion");
  expect(body.data.estado).toMatch(/AUTHORIZED|RUNNING|COMPLETED/);

  // segundo POST en la misma ventana -> mismo job, 200
  const res2 = await page.request.post("/api/organizacion/exportar");
  expect(res2.status()).toBe(200);
  expect((await res2.json()).data.id).toBe(body.data.id);

  const lista = await page.request.get("/api/organizacion/exportar");
  expect(lista.status()).toBe(200);
  expect((await lista.json()).data.some((j: { id: string }) => j.id === body.data.id)).toBe(true);

  await page.context().clearCookies();
  const viewer = await makeOrgWithUser("VIEWER");
  await login(page, viewer.email, viewer.password);
  const denegado = await page.request.post("/api/organizacion/exportar");
  expect(denegado.status()).toBe(403);
});
