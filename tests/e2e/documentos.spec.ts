import path from "node:path";
import { test, expect } from "@playwright/test";
import { login, TEST_USER } from "./helpers";

test.describe("Documentos", () => {
  test.skip(!TEST_USER.email, "Requiere TEST_USER_EMAIL/TEST_USER_PASSWORD");

  test("sube, visualiza y elimina un documento", async ({ page }) => {
    await login(page, TEST_USER.email, TEST_USER.password);

    await page.goto("/licitaciones/nueva");
    const expediente = `E2E-DOC-${Date.now()}`;
    await page.getByLabel("Número de expediente").fill(expediente);
    await page.getByLabel("Institución convocante").fill("Institución de prueba");
    await page.getByLabel("Título").fill("Licitación para prueba de documentos");
    await page.getByRole("button", { name: "Crear licitación" }).click();
    await page.waitForURL(/\/licitaciones\/[a-f0-9-]+$/);

    await page.getByRole("tab", { name: "Documentos" }).click();

    // "Otros documentos" — no un slot de "Documentos de la convocante" ni de
    // "Documentos requeridos", que también viven en este tab.
    const fileInput = page.getByTestId("otros-documentos-input");
    await fileInput.setInputFiles(path.join(__dirname, "fixtures", "documento-prueba.pdf"));

    await expect(page.getByText("documento-prueba.pdf")).toBeVisible({ timeout: 15_000 });

    // Eliminar — el botón de basura dentro del renglón de este documento
    // específico en la lista de "Otros documentos" (evita ambigüedad con los
    // demás controles del tab).
    const fila = page.locator("li").filter({ hasText: "documento-prueba.pdf" });
    await fila.getByRole("button").last().click();
    await expect(page.getByText("Documento eliminado")).toBeVisible();
  });
});
