import { test, expect } from "@playwright/test";
import { login, TEST_USER } from "./helpers";

test.describe("Autenticación", () => {
  test("redirige a /login cuando no hay sesión", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("login y logout", async ({ page }) => {
    test.skip(!TEST_USER.email, "Requiere TEST_USER_EMAIL/TEST_USER_PASSWORD");

    await login(page, TEST_USER.email, TEST_USER.password);
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    await page.getByRole("button").filter({ hasText: "" }).first(); // abre menú de usuario
    await page.locator('[data-slot="dropdown-menu-trigger"]').click();
    await page.getByText("Cerrar sesión").click();
    await expect(page).toHaveURL(/\/login/);
  });

  test("login con credenciales inválidas muestra error", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Correo electrónico").fill("no-existe@example.com");
    await page.getByLabel("Contraseña", { exact: true }).fill("clave-incorrecta");
    await page.getByRole("button", { name: "Iniciar sesión" }).click();
    await expect(page.getByText("No se pudo iniciar sesión")).toBeVisible();
  });

  test("login ya autenticado redirige a /dashboard", async ({ page }) => {
    test.skip(!TEST_USER.email, "Requiere TEST_USER_EMAIL/TEST_USER_PASSWORD");

    await login(page, TEST_USER.email, TEST_USER.password);
    await page.goto("/login");
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
