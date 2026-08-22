import path from "node:path";
import { test, expect } from "@playwright/test";
import { login, TEST_USER } from "./helpers";

test.describe("Análisis IA", () => {
  test.skip(!TEST_USER.email, "Requiere TEST_USER_EMAIL/TEST_USER_PASSWORD");

  test("analiza las bases y genera la ficha", async ({ page }) => {
    test.setTimeout(120_000);
    await login(page, TEST_USER.email, TEST_USER.password);

    await page.goto("/licitaciones/nueva");
    const expediente = `E2E-ANALISIS-${Date.now()}`;
    await page.getByLabel("Número de expediente").fill(expediente);
    await page.getByLabel("Institución convocante").fill("Institución de prueba");
    await page.getByLabel("Título").fill("Licitación para prueba de análisis");
    await page.getByRole("button", { name: "Crear licitación" }).click();
    await page.waitForURL(/\/licitaciones\/[a-f0-9-]+$/);

    await page.getByRole("tab", { name: "Documentos" }).click();
    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles(path.join(__dirname, "fixtures", "documento-prueba.pdf"));
    await expect(page.getByText("documento-prueba.pdf")).toBeVisible({ timeout: 15_000 });

    await page.getByRole("tab", { name: "Análisis IA" }).click();
    await page.getByRole("button", { name: "Analizar bases con IA" }).click();

    await expect(page.getByText("Análisis completado")).toBeVisible({ timeout: 100_000 });
    await expect(page.getByText("Datos generales")).toBeVisible();
  });
});
