import { test, expect } from "@playwright/test";
import { login, TEST_USER } from "./helpers";

test.describe("Propuesta económica", () => {
  test.skip(!TEST_USER.email, "Requiere TEST_USER_EMAIL/TEST_USER_PASSWORD y una licitación con partidas");

  test("edita el precio ofertado y calcula totales", async ({ page }) => {
    await login(page, TEST_USER.email, TEST_USER.password);

    // Usa la primera licitación existente con partidas ya extraídas.
    await page.goto("/licitaciones");
    await page.locator("a").filter({ hasText: /^E2E|LA-/ }).first().click();
    await page.getByRole("tab", { name: "Propuesta Económica" }).click();

    const primerInput = page.locator('input[type="number"]').first();
    await primerInput.fill("1000");

    // El total de la fila debe reflejar cantidad * 1000 * 1.16 (IVA)
    const filaTotal = page.locator("tbody tr").first().locator("td").last();
    await expect(filaTotal).not.toHaveText("—");

    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Propuesta económica guardada")).toBeVisible();
  });
});
