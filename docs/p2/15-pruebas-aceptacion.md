# P2 · Entregable 20 — Pruebas de aceptación (Fase J, cierre)

Cada escenario del brief → cómo se verifica y su evidencia. Casi todo ya
está cubierto por las suites construidas a lo largo de P2; J añade la
**carga concurrente** (`tests/load/`) y consolida el resto.

## 1. Cómo correr la aceptación completa

```bash
npx supabase start
docker restart supabase_edge_runtime_licitaai   # el edge local no hot-reloadea

# regresión (P0 + P1 + P2) — reiniciar el edge entre suites pesadas en local
npm run typecheck && npm run lint && npm run lint:migrations
npm run test:unit
npm run test:integration        # ver nota de entorno abajo
npm run test:e2e

# carga
npm run test:load               # carga-local.mjs, sin k6
# k6 (opcional, requiere la app corriendo + k6 instalado): ver tests/load/README.md
```

> **Nota de entorno (local, colima):** el edge runtime se satura si se
> corren las ~23 suites de integración seguidas (502 en cascada, GoTrue con
> errores). No es una regresión — se reproduce en `main`. Correr las suites
> de una en una, o en CI donde cada job arranca limpio. Ver `08-progreso.md`.

## 2. Matriz de escenarios

| # | Escenario (brief) | Verificación | Evidencia | Estado |
|---|---|---|---|---|
| 1 | **Carga concurrente multi-org** | 20 orgs × 25 jobs en paralelo + 4 workers | `tests/load/carga-local.mjs` | ✅ 500 jobs, creación p95 168 ms, drenaje 233 jobs/s |
| 2 | **Procesamiento simultáneo** | `reclamar_jobs` con `FOR UPDATE SKIP LOCKED`; varios workers no toman el mismo job | `p2-jobs.test.mjs` (#14), `carga-local.mjs` ("cero doble-procesamiento") | ✅ |
| 3 | **Reintentos y fallos parciales** | backoff+jitter, `max_intentos`, DLQ; multi-step reanuda desde `step_actual` | `p2-jobs.test.mjs` (#17–20), `p2-b1-procesar-documento.test.mjs` (reanudación), `retry.test.mjs` | ✅ |
| 4 | **Caída simulada de Anthropic / OpenAI** | circuit breaker CLOSED→OPEN→HALF_OPEN; el worker re-encola sin gastar reintentos | `p2-e-resiliencia.test.mjs` (16 casos), `p2-e-health.spec.ts` | ✅ |
| 5 | **Caída del correo (Resend)** | breaker `resend`; la notificación falla silenciosa, el job igual COMPLETA | `p2-jobs-notificacion.test.mjs`, `p2-e-resiliencia.test.mjs` | ✅ |
| 6 | **Job duplicado** | `unique(organization_id, idempotency_key)`; `crear_job` devuelve el existente | `p2-jobs.test.mjs` (#7–8), `carga-local.mjs` ("idempotency_key repetida"), `p2-h4-exportar.test.mjs` (#15–16) | ✅ |
| 7 | **Documento repetido** | `dedup_hash`; el step `extraer` borra los chunks previos antes de reinsertar | `p2-b1-procesar-documento.test.mjs` (#9 "reprocesar no duplica chunks") | ✅ |
| 8 | **Cancelación** | cooperativa (`cancel_solicitada` → checkpoint del handler); libera la reserva | `p2-job-worker.test.mjs` (#cancelación cooperativa), `p2-jobs-api.spec.ts`, `carga-local.mjs` | ✅ |
| 9 | **Presupuesto agotado** | `reservar_presupuesto_ia` → `P0001` + `hint`; 429 `AI_BUDGET_EXCEEDED` | `p2-c1-gobierno-costo-ia.test.mjs` (20 casos), `p2-c2c3-reserva-conciliacion.test.mjs` | ✅ |
| 10 | **Timeout** | `conTimeout` por invocación de EF (`Promise.race`); `withRetry` con `timeoutMs`; `STEP_BUDGET_MS` por step | `p2-b-invocar-ef.test.mjs`, `retry.test.mjs`, `p2-e-resiliencia.test.mjs` | ✅ |
| 11 | **Restauración de backup** | `pg_dump` cifrado + verificación de integridad; `restore-verify.mjs` | `scripts/backup-db.mjs` (verifica descifrando + `gunzip -t`); **drill real pendiente de proyecto aislado** (`14-backup-y-restauracion.md` §3) | ⚠️ código listo; drill bloqueado por infra |
| 12 | **Rollback de app** | flags OFF (segundos) → Vercel instant rollback → `git revert` → revertir migración aditiva | `04-rollback-y-dr.md` §2 (7 niveles); cada incremento tiene su fila de rollback en `03-plan-incremental.md` | ✅ documentado y por diseño |
| 13 | **Migración fallida** | linter de migraciones destructivas en CI; respaldo previo en `staging.yml`/`production.yml`; verificación contra base limpia | `scripts/lint-migraciones.mjs`, `runbooks/migracion-fallida.md`, `.github/workflows/*.yml` | ✅ |
| 14 | **Aislamiento multi-tenant bajo carga** | RLS en cada tabla; `carga-local.mjs` comprueba "org A no ve jobs de org B" durante el drenaje concurrente | `carga-local.mjs`, `p0-edge-functions-isolation.test.mjs`, `p2-jobs.test.mjs` (#9–10) | ✅ |
| 15 | **Rendimiento de RLS** | la creación de job (p95 168 ms con 20 orgs concurrentes) atraviesa `user_org_id()` + `job_recurso_pertenece()` en cada llamada; índices de P2.4 (F4) | `carga-local.mjs` (latencia de creación), `p2-f-rendimiento.test.mjs` | ✅ dentro de presupuesto |
| 16 | **Accesibilidad** | headings, `lang`, inputs con etiqueta accesible, botones con nombre en las páginas públicas y el dashboard | `tests/e2e/p2-j-accesibilidad.spec.ts` (smoke) + checklist de pre-lanzamiento abajo | ⚠️ smoke automatizado; auditoría con lector de pantalla pendiente |
| 17 | **Core Web Vitals** | presupuesto de bundle en CI (`check:bundle`: total ≤ 1500 KB gz, chunk ≤ 320 KB gz); `Server-Timing` + log `[api:slow]` (>800 ms) | `scripts/check-bundle.mjs`, `p2-f-rendimiento.test.mjs`; **LCP/INP de campo pendientes de datos de producción** (`11-rendimiento.md`) | ⚠️ presupuestos como gate; CWV de campo tras despliegue |
| 18 | **Escaneo de seguridad** | `npm audit` + `gitleaks` + CodeQL en CI; fix de grants del worker (`0df1bc1`); `p2-grants-worker-fns.test.mjs` (18 casos) | `.github/workflows/ci.yml`, `codeql.yml`, `p2-grants-worker-fns.test.mjs` | ✅ |
| 19 | **Regresión completa** | P0 + P1 + P2: 10 suites unit · 23 suites integración · e2e | `npm run check && npm run test:*` | ✅ en verde suite a suite (ver nota de entorno) |

## 3. Resultados de carga (referencia — local, colima, sin pooler)

`CARGA_ORGS=20 CARGA_JOBS_POR_ORG=25 CARGA_WORKERS=4` (tipo `noop`):

| Métrica | Valor |
|---|---|
| Jobs creados | 500 / 500 (0 errores) |
| Latencia de creación p50 / p95 / p99 | 39 / 168 / 225 ms |
| Drenaje de la cola | ~2.1 s |
| Throughput del worker | ~233 jobs/s (job `noop`, sin IA) |
| Doble-procesamiento | 0 |
| Jobs colgados tras el drenaje | 0 |
| Aislamiento entre organizaciones | intacto bajo carga |

Estos números son el **piso** (Postgres local sin PgBouncer, un solo core
de compute). En producción el `throughput` real lo domina la latencia de
los proveedores de IA, no la cola — se re-mide con carga de IA real cuando
haya API keys y presupuesto autorizados (`tests/load/README.md` §3).

## 4. Carga con IA real — pendiente

Necesita `ANTHROPIC_API_KEY` + `OPENAI_API_KEY` en el edge runtime y
presupuesto autorizado (cada job cuesta dinero; `ai_org_policy` lo acota a
propósito). Procedimiento en `tests/load/README.md` §3. Métricas a capturar:
tiempo-a-completar p50/p95 de `procesar-documento` y `analizar-bases`,
coste real por job vs. la estimación de `ai-estimate.ts`, comportamiento
del breaker bajo throttling real (429 de Anthropic).

## 5. Checklist de accesibilidad pre-lanzamiento (manual)

- [ ] Navegación completa por teclado en el flujo crítico (login → subir
      documento → generar análisis → revisar → liberar).
- [ ] Lector de pantalla (VoiceOver / NVDA) en las mismas pantallas.
- [ ] Contraste AA en el tema claro y oscuro.
- [ ] `prefers-reduced-motion` respetado en las animaciones.
- [ ] Focus visible y orden de tabulación lógico en los diálogos.
- [ ] Los estados de job (`<JobStatus>`) se anuncian (`aria-live`).

## 6. Criterio de cierre de P2

- [x] Escenarios 1–10, 12–15, 18–19: verde.
- [ ] Escenario 11 (drill de restauración real): **requiere proyecto Supabase aislado**.
- [ ] Escenarios 16–17 (auditoría de accesibilidad con lector de pantalla; CWV de campo): **requieren despliegue** y tiempo de operación.
- [ ] Carga con IA real (§4): **requiere API keys + presupuesto autorizado**.

Nada de lo pendiente es código: son un proyecto de restauración, un
despliegue y unas keys. El resto de P2 está listo para autorización de
despliegue a staging.
