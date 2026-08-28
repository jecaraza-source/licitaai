// P2 · J — smoke de accesibilidad de las páginas públicas.
//
// No sustituye una auditoría con lector de pantalla (checklist en
// docs/p2/15-pruebas-aceptacion.md §5). Comprueba lo mínimo automatizable:
// idioma declarado, un solo h1, controles de formulario con nombre
// accesible, y que los botones tienen texto.
//
//   npx playwright test tests/e2e/p2-j-accesibilidad.spec.ts
import { test, expect, type Page } from "@playwright/test";

const PUBLICAS = ["/login", "/register", "/estado"];

async function auditarBasico(page: Page, ruta: string) {
  await page.goto(ruta);

  // idioma declarado en <html>
  const lang = await page.locator("html").getAttribute("lang");
  expect(lang, `${ruta}: <html lang>`).toBeTruthy();

  // exactamente un h1
  const h1 = page.getByRole("heading", { level: 1 });
  expect(await h1.count(), `${ruta}: un solo <h1>`).toBeGreaterThanOrEqual(1);

  // todo <input>/<select>/<textarea> visible tiene nombre accesible
  const campos = page.locator("input:visible, select:visible, textarea:visible");
  for (let i = 0; i < (await campos.count()); i++) {
    const c = campos.nth(i);
    const tipo = await c.getAttribute("type");
    if (tipo === "hidden") continue;
    const nombre =
      (await c.getAttribute("aria-label")) ||
      (await c.getAttribute("aria-labelledby")) ||
      (await c.getAttribute("id").then((id) => (id ? page.locator(`label[for="${id}"]`).count() : 0))) ||
      (await c.getAttribute("placeholder"));
    expect(Boolean(nombre), `${ruta}: campo #${i} sin nombre accesible`).toBe(true);
  }

  // todo botón visible tiene texto o aria-label
  const botones = page.getByRole("button");
  for (let i = 0; i < (await botones.count()); i++) {
    const b = botones.nth(i);
    if (!(await b.isVisible())) continue;
    const txt = ((await b.textContent()) ?? "").trim();
    const aria = await b.getAttribute("aria-label");
    expect(Boolean(txt || aria), `${ruta}: botón #${i} sin nombre`).toBe(true);
  }
}

for (const ruta of PUBLICAS) {
  test(`accesibilidad básica — ${ruta}`, async ({ page }) => {
    await auditarBasico(page, ruta);
  });
}
