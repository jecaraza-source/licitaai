// P2 · H5 — e2e: rutas de borrado de organización (solicitar / estado /
// cancelar).
//
//   npx supabase start
//   npx playwright test tests/e2e/p2-h5-borrado.spec.ts
import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { LOCAL } from "../helpers/local-supabase.mjs";

const SUPABASE_URL = process.env.SUPABASE_URL ?? LOCAL.url;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? LOCAL.serviceRoleKey;

test.skip(SUPABASE_URL.includes("supabase.co"), "local only");
const admin = createClient(SUPABASE_URL, SERVICE_KEY);
const rnd = () => Math.random().toString(36).slice(2, 10);

async function makeOrg(rol: "ADMIN" | "MANAGER" = "ADMIN") {
  const nombre = `Org ${rnd()}`;
  const { data: org } = await admin.from("organizations").insert({ nombre }).select("id").single();
  const { data: ticket } = await admin.from("signup_tickets").insert({ organization_id: org!.id }).select("id").single();
  const email = `u-${rnd()}@example.org`;
  const password = "TestPassword123!";
  const { data: u, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { nombre: "Test", signup_ticket: ticket!.id },
  });
  if (error) throw error;
  if (rol !== "ADMIN") await admin.from("users").update({ rol }).eq("id", u.user!.id);
  return { orgId: org!.id as string, nombre, email, password };
}
async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.waitForURL(/\/(dashboard|seleccionar-empresa)/);
}

test("solicitar borrado exige el nombre exacto y ADMIN; cancelable en la gracia", async ({ page }) => {
  const org = await makeOrg("ADMIN");
  await login(page, org.email, org.password);

  // sin solicitud previa
  const est0 = await page.request.get("/api/organizacion/borrar");
  expect(est0.status()).toBe(200);
  expect(await est0.json()).toMatchObject({ data: null });

  // confirmación incorrecta -> 400
  const mala = await page.request.post("/api/organizacion/borrar", { data: { confirmacion: "NoEsElNombre" } });
  expect(mala.status()).toBe(400);

  // confirmación correcta -> 202 PROGRAMADA
  const ok = await page.request.post("/api/organizacion/borrar", { data: { confirmacion: org.nombre } });
  expect(ok.status()).toBe(202);
  const body = await ok.json();
  expect(body.data.estado).toBe("PROGRAMADA");
  expect(new Date(body.data.programada_para).getTime()).toBeGreaterThan(Date.now() + 6 * 86400_000);

  // duplicada -> 409
  const dup = await page.request.post("/api/organizacion/borrar", { data: { confirmacion: org.nombre } });
  expect(dup.status()).toBe(409);

  // estado refleja la solicitud
  const est1 = await page.request.get("/api/organizacion/borrar");
  expect((await est1.json()).data.estado).toBe("PROGRAMADA");

  // cancelar
  const cancel = await page.request.post("/api/organizacion/borrar/cancelar");
  expect(cancel.status()).toBe(200);
  expect((await cancel.json()).data.estado).toBe("CANCELADA");

  // MANAGER no puede solicitar
  await page.context().clearCookies();
  const mgr = await makeOrg("MANAGER");
  await login(page, mgr.email, mgr.password);
  const denegado = await page.request.post("/api/organizacion/borrar", { data: { confirmacion: mgr.nombre } });
  expect(denegado.status()).toBe(403);
});
