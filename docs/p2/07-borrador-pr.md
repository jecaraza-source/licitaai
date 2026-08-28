# PR — P2 · Preparación para producción

**Rama:** `architecture/p2-production-readiness` · **Base:** `main` (incluye P0 + P1, ya revisados en sus propios commits)
**Alcance P2:** commits `610cd5e` … `793ed2b` — 205 archivos, +16 200 / −105, 22 migraciones (todas aditivas), 24 commits.

> ⚠️ **No desplegar sin autorización.** Todo el cambio de comportamiento está detrás de feature flags **apagados**. Este PR es infraestructura + código inerte; la activación es gradual, por organización, y posterior.

---

## Qué resuelve

Toda operación pesada de IA/documentos corría dentro de una petición HTTP abierta: sin reintento, sin idempotencia, sin rastro, a veces dejando el documento marcado como "procesado" cuando falló. Sin control de costo de IA por organización, sin historial de resultados, sin prueba de restauración, sin runbooks, sin separación prod/staging.

P2 lo convierte en una plataforma operable. **El sustrato es Postgres + Supabase + Vercel — ningún proveedor nuevo** (ADR 0001).

## Cómo está construido

| Área | Entrega |
|---|---|
| **Jobs asíncronos** (P2.1) | `public.jobs` como fuente de verdad única · `reclamar_jobs` con `FOR UPDATE SKIP LOCKED` · worker en Edge Function disparado por Vercel Cron (1 min) + pg_cron opcional · handlers por steps reanudables (ADR 0002) · backoff con jitter · DLQ · cancelación cooperativa · idempotencia por `unique(organization_id, idempotency_key)` · Realtime + `<JobStatus>` · notificación por email de jobs largos |
| **Gobierno de costo de IA** (P2.2) | `ai_org_policy` (cuotas) · `ai_budget_ledger` append-only (`gasto = Σ RESERVADO + Σ CONSUMIDO − Σ LIBERADO`) · flujo reservar → ejecutar → conciliar · 429 `AI_BUDGET_EXCEEDED` (ADR 0004) |
| **Trazabilidad de IA** (P2.3) | `ai_results` append-only (nunca se sobrescribe `resultado_json`; una corrección es una fila nueva con `reemplaza_a`) · `prompt_templates` versionados · `ai_result_citations` · aprobación humana `PENDIENTE/APROBADO/RECHAZADO` (ADR 0006) |
| **Resiliencia** (P2.5) | `retry.ts` v2 (clasificación de errores, jitter, `Retry-After`, timeout por intento) · circuit breakers por proveedor `CLOSED→OPEN→HALF_OPEN` · con el circuito abierto el worker re-encola **sin gastar reintentos** · `/api/health`, `/api/ready`, `/api/estado` (ADR 0005) |
| **Rendimiento** (P2.4) | `Server-Timing` + log `[api:slow]` · presupuesto de bundle como gate de CI (≤ 1500 KB gz total, ≤ 320 KB gz por chunk) · code-split de las 6 pestañas pesadas · índices por los patrones de P2 |
| **Datos, retención, borrado** (P2.6) | clasificación de datos (`13-clasificacion-datos.md`) · `data_retention_policy` + `retencion_archive` inmutable + limpieza **que arranca toda en dry-run** · export de organización (job → bundle jsonb + URL firmada 72 h) · **borrado orquestado con gracia de 7 días**: `ON DELETE CASCADE` es el último paso, precedido por export, revocación de sesiones, borrado de Storage por prefijo y sello inmutable con el hash del manifiesto (ADR 0010) |
| **Respaldo / restauración** (P2.7) | `pg_dump` cifrado + verificación de integridad · snapshot de config versionado en git · `restore-verify.mjs` · procedimiento de drill (`14-backup-y-restauracion.md`) |
| **CI/CD** (P2.8) | `ci.yml` (typecheck, lint, **lint de migraciones destructivas**, `npm audit`, deno check, unit + integración + e2e, gitleaks) · CodeQL · `staging.yml` / `production.yml` con respaldo previo, verificación contra base limpia y aprobación manual vía Environment |
| **Operación** (P2.9) | `metricas_operacion()` · `/admin/salud` (gated por `PLATFORM_ADMIN_EMAILS`, fail-closed) · monitoreo sintético con severidad SEV1/2/3 → Sentry + webhook · SLO + error budgets (`10-slo-y-alertas.md`) · **8 runbooks** |
| **Producto** (P2.10) | `audit_log` inmutable encadenado por hash · consentimiento de términos con gate · planes comerciales → `ai_org_policy` · `metricas_valor()` (tasa de aceptación humana, coste por expediente…) · `<AvisoRevisionIA>` |
| **Aceptación bajo carga** (Fase J) | `tests/load/carga-local.mjs` (500 jobs, 20 orgs concurrentes: cero doble-procesamiento, aislamiento multi-tenant, cola drenada) · script k6 para carga HTTP · smoke de accesibilidad · matriz de los 19 escenarios (`15-pruebas-aceptacion.md`) |

## Compatibilidad y rollback

- **Todas las migraciones son aditivas** (o expand/contract). El linter de CI bloquea `DROP TABLE/COLUMN`, `TRUNCATE`, `ALTER COLUMN TYPE` y `DROP CONSTRAINT` sin re-add salvo marca `-- safe:` / `-- expand-contract:`. Única excepción marcada: H5 quita 2 FK de `audit_log` (no pierde datos; una bitácora inmutable debe conservar el id original).
- **Cada incremento revierte por**: (1) bajar su flag — segundos, sin deploy; (2) Vercel instant rollback; (3) redeploy de Edge Functions; (4) `git revert`; (5) revertir la migración aditiva (`-- Rollback:` en cada archivo). Detalle en `04-rollback-y-dr.md`.
- **Controles de P0/P1 intactos**: re-derivación server-side de identidad/rol/organización, JWT + org gate en cada Edge Function, allowlist MIME + magic bytes, guardia anti prompt-injection, validación de esquema de salida, rate limit. El fix `0df1bc1` **refuerza** la seguridad (revoca `EXECUTE` de `authenticated` en las 21 funciones del worker que Supabase auto-concede).

## Costos y límites

`05-costos-y-limites.md`. Sin gasto nuevo aprobado en este PR. Pendientes de decisión del negocio: proyecto Supabase de staging (~$25–35/mes) y PITR (~$100/mes) o aceptación formal del RPO de 24 h.

## Verificación

- `npm run check` limpio (2 warnings preexistentes de TanStack).
- 10 suites unit · 18 suites de integración P2 (~295 casos) · 57 e2e · `npm run test:load` verde. `deno check` limpio salvo un gap preexistente documentado.
- Regresión P0/P1 sin cambios.
- Nota: en local (colima) el edge runtime se satura si se corren las ~23 suites de integración seguidas — correr de una en una o en CI. No es regresión (se reproduce en `main`).

## Qué queda fuera de este PR (no es código)

- Crear el proyecto de staging + secrets de GitHub + branch protection (G2).
- Drill de restauración real (necesita un proyecto Supabase aislado) y decisión de PITR (H7/H8).
- Carga con IA real, auditoría de accesibilidad con lector de pantalla, CWV de campo (necesitan keys + despliegue).
- Retirar el modo síncrono de cada operación (B11) — post-despliegue, tras 2 semanas estable con el flag al 100%.

## Checklist de revisión

- [ ] Los ADR 0001–0010 reflejan lo implementado.
- [ ] Ninguna migración toca datos existentes sin marca.
- [ ] Ningún flag nuevo arranca encendido.
- [ ] `ON DELETE CASCADE` no es el único plan de borrado de ninguna tabla nueva.
- [ ] Ninguna función nueva del worker es ejecutable por `authenticated`.
- [ ] Los secretos nuevos están documentados (no en el repo): `JOB_WORKER_SECRET`/`CRON_SECRET`, `BACKUP_PASSPHRASE`, `ALERTAS_WEBHOOK_URL`, `PLATFORM_ADMIN_EMAILS`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
