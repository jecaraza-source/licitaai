import type { Page } from "@playwright/test";

/**
 * Estas pruebas requieren una cuenta ya confirmada (TEST_USER_EMAIL /
 * TEST_USER_PASSWORD) porque el proyecto de Supabase exige confirmación de
 * correo por defecto — un flujo de registro real no se puede automatizar en
 * CI sin leer el correo de confirmación. Ver README.md § Pruebas E2E.
 */
export const TEST_USER = {
  email: process.env.TEST_USER_EMAIL ?? "",
  password: process.env.TEST_USER_PASSWORD ?? "",
};

export const TEST_VIEWER = {
  email: process.env.TEST_VIEWER_EMAIL ?? "",
  password: process.env.TEST_VIEWER_PASSWORD ?? "",
};

export async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.waitForURL("**/dashboard");
}
