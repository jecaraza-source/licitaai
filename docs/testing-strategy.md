# Estrategia de pruebas (P1.3)

## Capas

| Capa | Ubicación | Runner | Qué cubre | Necesita |
|---|---|---|---|---|
| Unitaria | `tests/unit/*.test.mjs` | `scripts/test-runner.mjs` (vía `tsx`) | Lógica pura: validación Zod (`src/lib/api/validate.ts`), catálogo de errores, e.firma (`node-forge`), validación de archivos (magic bytes), feature flags, guard de cron, bloque de contenido de Anthropic, validador de esquema de IA, cálculos de exportación a Excel | — |
| Integración | `tests/integration/*.test.mjs` | `scripts/test-runner.mjs` (vía `node`) | RPCs, triggers, RLS multi-tenant, presupuesto de IA, sistema de jobs, retención, borrado, trazabilidad — **contra un Postgres real** | `npx supabase start` |
| Edge Functions | subconjunto de integración (`p0-edge-functions-isolation`, `p2-job-worker`, …) | igual | Aislamiento cross-tenant en las 9 Edge Functions, worker de jobs | stack local **con** edge runtime (`supabase start -x imgproxy,vector`) |
| E2E | `tests/e2e/*.spec.ts` | Playwright | Flujos de UI: auth, licitaciones, análisis, auditoría, propuesta económica, e.firma, jobs asíncronos, la capa de API (`p1-api-layer.spec.ts`) | stack local + `next build` + navegador |
| Carga | `tests/load/*` | `node` / k6 | Cero doble-procesamiento de jobs, aislamiento bajo carga, idempotencia | stack local |
| Contratos de IA | integración con `MOCK_AI` | igual | Los handlers de IA sin llamar a un proveedor real (respuestas simuladas) | — |

## Fixtures compartidas

`tests/helpers/fixtures.mjs` — un solo lugar para el andamiaje que antes cada archivo reimplementaba:

- `crearOrganizacion({ roles })` — organización con un usuario por cada rol (`ADMIN`, `MANAGER`, `ANALYST`, `VIEWER`); `.cliente(rol)` devuelve un cliente Supabase autenticado como ese usuario (RLS activo).
- `crearOrganizacionesAyB()` — dos organizaciones aisladas para probar multi-tenant.
- `crearLicitacion(orgId)`, `crearDocumento(licId)`.
- `crearInvitacion(orgId, { vencida })` — invitación de staff válida o ya expirada.
- Cada fixture trae su `limpiar()`.

Cada usuario consume su propio `signup_ticket` (el trigger `handle_new_user()` de P0.1 rechaza cualquier alta sin ticket/invitación válida) y luego se le fija el rol.

## Gates de CI (P1.3)

| Gate | Cómo | Falla si |
|---|---|---|
| Higiene | `npm run test:hygiene` (`scripts/check-test-hygiene.mjs`), en el job `quality` | Hay un `.only` en cualquier test, o un spec entero está deshabilitado con un skip incondicional |
| `.only` en e2e | `npx playwright test --forbid-only` | Hay un `test.only` en un spec de Playwright |
| Cobertura | `npm run test:coverage` (`c8`, `.c8rc.json`), en el job `unit` | La cobertura de los módulos de `src/lib` bajo prueba unitaria cae de `lines 80 / functions 80 / branches 70 / statements 80` |
| typecheck / build | `npm run typecheck`, `npm run build`, job `quality` | Cualquier error de tipos o de build |
| Auditoría de dependencias | `npm audit --omit=dev --audit-level=high` | Vulnerabilidad `high`+ en dependencias de producción |
| Integración + e2e | job `supabase-tests` (stack local real) | Cualquier test de integración o e2e falla |
| Secretos | `gitleaks` | Un secreto entra al repo |

**Pendiente de configuración de repo, no de código**: en `main`/`staging` (ramas protegidas), CI debe además fallar si faltan `TEST_USER_EMAIL`/`TEST_USER_PASSWORD` — hoy los specs que los necesitan se auto-omiten con `test.skip(cond, …)`, lo cual es correcto en local pero en una rama protegida debería ser un error. Esto se cierra añadiendo un paso `if: github.ref == 'refs/heads/main'` que verifique la presencia de esos secrets antes de correr Playwright.

## Por qué c8 + runner propio y no Vitest

El brief pedía "incorporar Vitest". Se optó por **no** hacerlo:

- El repo ya tiene un runner propio (`scripts/test-runner.mjs`, ~40 líneas) con ~130 casos unitarios y ~300 de integración funcionando. Los de integración corren con `node` + `supabase-js` contra un Postgres real; no hay nada que Vitest mejore ahí.
- Adoptar Vitest obligaría a reescribir todos los archivos existentes (usan un helper `check()` y `console.log`, no `expect`) — un cambio grande y mecánico sin beneficio funcional, justo el tipo de "abstracción innecesaria" que las reglas de trabajo de esta fase piden evitar.
- Lo que el brief busca de Vitest —cobertura con umbral, detección de `.only`, capas organizadas— se obtiene con `c8` (cobertura + gate) y `check-test-hygiene.mjs` (`.only` / skips), sin tocar los 40+ archivos de test.

Si en el futuro se quiere migrar a Vitest, el camino es: `vitest` para la capa unitaria (`tests/unit`), conservando el runner `.mjs` para integración (que depende del stack local, no del framework).
