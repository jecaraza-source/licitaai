import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    // P2 — flags que los e2e necesitan activos. En producción arrancan
    // apagados; se activan por override de entorno (ADR 0008). Ningún otro
    // e2e depende del procesamiento de documentos, así que activar
    // jobs.async_procesar_documento globalmente aquí es seguro.
    env: {
      ...process.env,
      FLAG_JOBS_API: "on",
      FLAG_JOBS_ASYNC_PROCESAR_DOCUMENTO: "on",
      FLAG_JOBS_ASYNC_ANALIZAR_BASES: "on",
      FLAG_JOBS_ASYNC_ESTUDIO_MERCADO: "on",
      FLAG_JOBS_ASYNC_PREGUNTAS_JUNTA: "on",
      FLAG_JOBS_ASYNC_PROPUESTA_TECNICA: "on",
      FLAG_JOBS_ASYNC_AUDITAR_DOCUMENTO: "on",
      FLAG_JOBS_ASYNC_AUDITAR_EXPEDIENTE: "on",
      FLAG_JOBS_ASYNC_ANALIZAR_FALLO: "on",
      FLAG_JOBS_ASYNC_ANALIZAR_DOC_CORP: "on",
      // P2 · I — panel de operación y monitoreo.
      PLATFORM_ADMIN_EMAILS: "platform-admin-e2e@example.org",
      CRON_SECRET: "e2e-cron-secret-0123456789abcdef",
      // P2 · E — circuit breaker siempre evaluado en e2e (los tests
      // manipulan provider_health directamente, no el flag).
      FLAG_RESILIENCIA_CIRCUIT_BREAKER: "on",
      // P2 · I6 — los e2e crean usuarios vía la admin API (sin pasar por el
      // flujo de aceptación de términos); se desactiva el gate.
      TERMINOS_GATE: "off",
      // P2 · H — autoservicio de datos (export / borrado de organización).
      FLAG_DATOS_EXPORT_ORGANIZACION: "on",
      FLAG_DATOS_BORRADO_ORGANIZACION: "on",
    },
  },
});
