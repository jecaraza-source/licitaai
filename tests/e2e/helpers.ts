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

/**
 * Alta de licitación en pasos: llena los tres campos obligatorios del primer
 * paso, avanza hasta el último (las fechas son opcionales) y crea. Termina en
 * la ficha, en la pestaña Documentos.
 */
export async function crearLicitacion(
  page: Page,
  datos: { expediente: string; institucion?: string; titulo: string },
) {
  await page.goto("/licitaciones/nueva");
  await page.getByLabel("Número de expediente").fill(datos.expediente);
  await page.getByLabel("Institución convocante").fill(datos.institucion ?? "Institución de prueba");
  await page.getByLabel("Título").fill(datos.titulo);
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.getByRole("button", { name: "Crear licitación" }).click();
  await page.waitForURL(/\/licitaciones\/[a-f0-9-]+(\?.*)?$/);
}
