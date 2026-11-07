import path from "node:path";
import { test, expect } from "@playwright/test";
import { login, TEST_USER, crearLicitacion } from "./helpers";

test.describe("Análisis IA", () => {
  test.skip(!TEST_USER.email, "Requiere TEST_USER_EMAIL/TEST_USER_PASSWORD");

  test("analiza las bases y genera la ficha", async ({ page }) => {
    test.setTimeout(120_000);
    await login(page, TEST_USER.email, TEST_USER.password);

    const expediente = `E2E-ANALISIS-${Date.now()}`;
    await crearLicitacion(page, { expediente, institucion: "Institución de prueba", titulo: "Licitación para prueba de análisis" });

    await page.getByRole("tab", { name: "Documentos" }).click();
    // "Otros documentos" es el único slot que dispara el procesamiento
    // (chunking/embeddings) que "Analizar bases con IA" necesita.
    await page
      .getByTestId("otros-documentos-input")
      .setInputFiles(path.join(__dirname, "fixtures", "documento-prueba.pdf"));
    await expect(page.getByText("documento-prueba.pdf")).toBeVisible({ timeout: 15_000 });

    await page.getByRole("tab", { name: "Análisis IA" }).click();
    await page.getByRole("button", { name: "Analizar bases con IA" }).click();

    await expect(page.getByText("Análisis completado")).toBeVisible({ timeout: 100_000 });
    await expect(page.getByText("Datos generales")).toBeVisible();
  });
});
