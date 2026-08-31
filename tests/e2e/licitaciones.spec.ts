import { test, expect } from "@playwright/test";
import { login, TEST_USER } from "./helpers";

test.describe("Licitaciones — CRUD", () => {
  test.skip(!TEST_USER.email, "Requiere TEST_USER_EMAIL/TEST_USER_PASSWORD");

  test.beforeEach(async ({ page }) => {
    await login(page, TEST_USER.email, TEST_USER.password);
  });

  test("crea, ve y cambia el estado de una licitación", async ({ page }) => {
    const expediente = `E2E-${Date.now()}`;

    await page.goto("/licitaciones/nueva");
    await page.getByLabel("Número de expediente").fill(expediente);
    await page.getByLabel("Institución convocante").fill("Institución de prueba E2E");
    await page.getByLabel("Título").fill("Licitación de prueba E2E");
    await page.getByRole("button", { name: "Crear licitación" }).click();

    await page.waitForURL(/\/licitaciones\/[a-f0-9-]+$/);
    await expect(page.getByRole("heading", { name: "Licitación de prueba E2E" })).toBeVisible();
    await expect(page.getByText(expediente)).toBeVisible();

    // Aparece en el listado
    await page.goto("/licitaciones");
    await expect(page.getByText(expediente)).toBeVisible();

    // Cambiar estado
    await page.getByText(expediente).click();
    await page.locator('[data-slot="select-trigger"]').first().click();
    await page.getByRole("option", { name: "Análisis" }).click();
    await expect(page.getByText('cambió el estado')).toBeVisible();
  });

  test("filtra el listado por texto", async ({ page }) => {
    await page.goto("/licitaciones");
    await page.getByPlaceholder(/Buscar por expediente/).fill("xxxx-no-existe-xxxx");
    await expect(page.getByText("No se encontraron licitaciones")).toBeVisible();
  });
});
