import { test, expect } from "@playwright/test";
import { login, TEST_USER, TEST_VIEWER } from "./helpers";

test.describe("Multi-rol — ADMIN vs VIEWER", () => {
  test("ADMIN puede crear licitaciones", async ({ page }) => {
    test.skip(!TEST_USER.email, "Requiere TEST_USER_EMAIL/TEST_USER_PASSWORD");

    await login(page, TEST_USER.email, TEST_USER.password);
    await page.goto("/licitaciones/nueva");
    await page.getByLabel("Número de expediente").fill(`E2E-ROL-${Date.now()}`);
    await page.getByLabel("Institución convocante").fill("Institución de prueba");
    await page.getByLabel("Título").fill("Licitación de prueba de rol ADMIN");
    await page.getByRole("button", { name: "Crear licitación" }).click();
    await page.waitForURL(/\/licitaciones\/[a-f0-9-]+$/);
  });

  test("VIEWER no ve el botón ni puede acceder a /licitaciones/nueva", async ({ page }) => {
    test.skip(
      !TEST_VIEWER.email,
      "Requiere un usuario con rol VIEWER (TEST_VIEWER_EMAIL/TEST_VIEWER_PASSWORD) en la misma organización",
    );

    await login(page, TEST_VIEWER.email, TEST_VIEWER.password);

    await page.goto("/licitaciones");
    await expect(page.getByRole("link", { name: "Nueva licitación" })).toHaveCount(0);

    // Acceso directo por URL también se bloquea server-side (redirect a /licitaciones).
    await page.goto("/licitaciones/nueva");
    await expect(page).toHaveURL(/\/licitaciones$/);
  });

  test("VIEWER no puede crear vía API directa (bloqueado por RLS)", async ({ request, page }) => {
    test.skip(
      !TEST_VIEWER.email,
      "Requiere un usuario con rol VIEWER (TEST_VIEWER_EMAIL/TEST_VIEWER_PASSWORD) en la misma organización",
    );

    await login(page, TEST_VIEWER.email, TEST_VIEWER.password);
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

    const res = await request.post("/api/licitaciones", {
      headers: { Cookie: cookieHeader, "Content-Type": "application/json" },
      data: {
        numero_expediente: `E2E-VIEWER-${Date.now()}`,
        titulo: "Intento de creación por VIEWER",
        institucion: "Institución de prueba",
        tipo: "ADQUISICION",
        estado_id: "FEDERAL",
        sistema: "COMPRANET",
      },
    });

    expect(res.ok()).toBe(false);
  });
});
