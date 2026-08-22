import path from "node:path";
import { test, expect } from "@playwright/test";
import { login, TEST_USER } from "./helpers";

test.describe("Auditoría", () => {
  test.skip(!TEST_USER.email, "Requiere TEST_USER_EMAIL/TEST_USER_PASSWORD");

  test("sube un documento de checklist y el score se actualiza", async ({ page }) => {
    test.setTimeout(60_000);
    await login(page, TEST_USER.email, TEST_USER.password);

    await page.goto("/licitaciones/nueva");
    const expediente = `E2E-AUDIT-${Date.now()}`;
    await page.getByLabel("Número de expediente").fill(expediente);
    await page.getByLabel("Institución convocante").fill("Institución de prueba");
    await page.getByLabel("Título").fill("Licitación para prueba de auditoría");
    await page.getByRole("button", { name: "Crear licitación" }).click();
    await page.waitForURL(/\/licitaciones\/[a-f0-9-]+$/);

    await page.getByRole("tab", { name: "Auditoría" }).click();
    const scoreInicial = await page.getByText(/^\d+$/).first().textContent();

    // Expande el primer requisito del checklist y carga un documento.
    await page.locator("button").filter({ hasText: /RFC|Constancia/i }).first().click();
    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles(path.join(__dirname, "fixtures", "documento-prueba.pdf"));

    await expect(page.getByText("Documento auditado")).toBeVisible({ timeout: 40_000 });

    const scoreFinal = await page.getByText(/^\d+$/).first().textContent();
    expect(scoreFinal).not.toBe(scoreInicial);
  });
});
