# P2 · Entregable 16/17 — Plan de implementación incremental

Cada incremento = 1 rama corta desde `architecture/p2-production-readiness` → 1 (o pocos) commits → tests → PR interno. Sin despliegue productivo sin autorización explícita. Compatibilidad hacia atrás salvo donde se indique. Todo cambio de alto impacto detrás de un feature flag (ADR 0008).

Leyenda de esfuerzo: **S** ≤ ½ día · **M** 1–2 días · **L** 3–5 días · **XL** > 1 semana.

---

## Fase A — Cimientos de jobs (P2.1)

| # | Incremento | Esfuerzo | Entregable | Cómo probar | Cómo revertir |
|---|---|---|---|---|---|
| A1 | Migración `jobs` + `jobs_dead_letter` + RPCs `crear_job`/`cancelar_job` + RLS + índices. Habilitar `pg_cron`, `pg_net`. | M | Esquema del brief (§ doc 2.2) | Tests de integración: crear job (RLS deniega insert directo), unicidad de `idempotency_key`, transición de estados vía RPC, `FOR UPDATE SKIP LOCKED` con 2 sesiones. | Migración aditiva → `drop table jobs, jobs_dead_letter cascade;` + `drop function`. Nada la usa aún. |
| A2 | Edge Function `job-worker`: loop de selección, lease, ejecución de un step dummy, re-encolado, DLQ, timeout de lease. Sin handlers reales todavía. | L | Worker funcional con un tipo `noop` | Test: encolar 50 `noop`, verificar que todos llegan a COMPLETED, ninguno procesado 2 veces, worker muerto (mata mid-step) → otro lo retoma. | Borrar la función; `crear_job` sigue existiendo pero nada drena la cola (jobs quedan AUTHORIZED → EXPIRED). |
| A3 | Disparadores: `pg_cron` cada 10 s + Vercel Cron 1 min (respaldo) + Database Webhook en insert. | S | Arranque de job p95 medido | Encolar y cronometrar arranque 100 veces; p95 < 10 s. | Quitar el cron job (`cron.unschedule`) y el webhook. |
| A4 | Rutas `POST /api/jobs`, `GET /api/jobs/:id`, `POST /api/jobs/:id/cancel` en `apiRoute()` + esquemas Zod. | M | API de jobs | Tests de ruta: auth, rol, org scope, cancelación de job ajeno = 404. | Borrar las rutas. |
| A5 | Realtime sobre `jobs` + componente `<JobStatus>` con fallback a polling + hook `useJob`. | M | UX de progreso | Playwright: encolar, ver barra avanzar vía Realtime; con Realtime bloqueado, ver que hace polling. | `drop publication ... jobs`; el componente queda pero solo hace polling. |
| A6 | Notificación por email de jobs largos (Resend), idempotente por `job_id`. | S | — | Test: job > 60 s manda 1 correo; reintento del step de notificación no manda 2. | Quitar el step de notificación. |

**Salida de Fase A:** infraestructura de jobs completa, probada con un tipo `noop`. Ninguna operación real migrada aún → cero riesgo para producción.

---

## Fase B — Migrar operaciones a jobs (P2.1, una por una)

Patrón por operación (flag `jobs.async_<tipo>`):
1. Refactorizar la Edge Function de dominio a handler(s) de step (input desde `jobs.input_json`, reporta progreso, devuelve `{result, usage, provider, modelo}`).
2. La ruta actual: si el flag está on → `crear_job` + long-poll corto (≤ 8 s) → `202 {job_id}` o `200 {data}`. Si off → comportamiento actual intacto.
3. Tests: equivalencia de resultado sync vs async; fallo del proveedor → job RETRYING/FAILED, no COMPLETED; cancelación; idempotencia (mismo `idempotency_key` → mismo job).

| # | Operación | Esfuerzo | Notas |
|---|---|---|---|
| B1 | `procesar-documento` (multi-step: descargar→extraer→chunk→embeddings→finalizar) | L | El caso con más reanudación; valida el modelo de steps de ADR 0002. |
| B2 | `analizar-bases` | M | Ya valida esquema; añadir persistencia vía worker + citas. |
| B3 | `generar-estudio-mercado` | M | web_search → timeouts largos. |
| B4 | `generar-preguntas-junta` | S | + añadir `requiereIA` (gap de P1). |
| B5 | `generar-propuesta-tecnica` | M | Respuestas largas → multi-step o `max_tokens` alto + detección de incompleto. + `requiereIA`. |
| B6 | `auditar-documento` | S | |
| B7 | `auditar-expediente` + reemplazar el fan-out de `auditar-todos` por N jobs `auditar-documento` con prioridad + concurrencia por org | M | Cierra B4 del doc 1 (fan-out sin control). |
| B8 | `seguimiento/analizar-fallo` | S | |
| B9 | `analizar-documento-corporativo` | S | |
| B10 | `procesar-referencia-legal` | S | |
| B11 | Retirar el modo síncrono de las operaciones migradas (subir flags a 100 %, luego borrar el código sync) | M | Solo tras 2 semanas estables de cada una. |

---

## Fase C — Gobierno de costo de IA (P2.2)

| # | Incremento | Esfuerzo | Probar | Revertir |
|---|---|---|---|---|
| C1 | Migración `ai_org_policy` + `ai_budget_ledger` + `ai_model_pricing` + RPCs `reservar/conciliar/liberar` + defaults por org | M | Tests: reserva rebasa cuota → falla con motivo; conciliación ajusta al real; liberar en fallo | Aditiva; `drop` |
| C2 | `lib/ai-estimate` (estimación de tokens por tipo/tamaño) + integrar en `POST /api/jobs` (reserva antes de AUTHORIZED) | M | Estimado vs real en dataset conocido, error < 40 % | Flag `ai.gobierno_costo` off → no reserva |
| C3 | Worker concilia costo al terminar step de IA; job a FAILED si presupuesto agotado | S | Test "presupuesto agotado" del brief | Flag off |
| C4 | Política de modelo (económico por defecto, escalar con justificación) + allowlist `modelos_permitidos` | M | Test: extracción usa modelo económico; allowlist bloquea modelo no permitido | Flag; default = modelo actual |
| C5 | `ai_cache` (hash contenido+prompt_ver+modelo) + lookup en worker + dedup de embeddings por `content_sha256` | L | Test: 2º job idéntico = cache hit, 0 tokens; embedding duplicado no se regenera | Flag `ai.cache` off |
| C6 | Concurrencia máx por org (`max_concurrent_jobs`) en `crear_job` | S | Test: N+1 jobs → el extra espera en PENDING | Config → valor alto |
| C7 | Dashboard `/configuracion/consumo-ia` (ADMIN): consumo por día/op/modelo, presupuesto, cache hits, reintentos — sin prompts | M | Playwright + revisión: no expone `input_json` | Ocultar ruta |
| C8 | Alertas de presupuesto (50/80/95 %) → Sentry/email | S | Simular consumo, verificar alerta | Quitar el check |

---

## Fase D — Trazabilidad y calidad de IA (P2.3)

| # | Incremento | Esfuerzo | Probar | Revertir |
|---|---|---|---|---|
| D1 | Migración `ai_results` (append-only) + `prompt_templates` + `ai_result_citations` + backfill desde tablas actuales | L | Backfill idempotente; conteo == filas previas | Aditiva; punteros de dominio siguen leyendo lo viejo si se revierte |
| D2 | Mover prompts del código a `prompt_templates` (seed versionado); handlers referencian `template_id+version` | M | Snapshot de prompts == comportamiento previo | Revertir a literales |
| D3 | Worker persiste `ai_results` + citas transaccionalmente; tablas de dominio leen vía puntero al resultado activo | L | Equivalencia de lectura en UI; re-análisis crea fila nueva con `reemplaza_a` | Flag `ai.versionado_resultados`; puntero → última fila (comportamiento actual) |
| D4 | Detección de salida incompleta (`stop_reason`, campos faltantes) + rótulo UI "no verificado" | S | Test con `max_tokens` bajo forzado | — |
| D5 | Aprobación humana para acciones críticas + endpoint de comparación de versiones | M | Test: liberar propuesta bloqueada sin `APROBADO` | Flag; gate off |
| D6 | Flujo "reportar resultado incorrecto" → `ai_results` RECHAZADO + registro | S | Playwright | Ocultar botón |
| D7 | Suite `tests/evals/` + dataset inicial (20 casos) + métricas + casos de prompt injection + gate de CI | XL | `npm run evals` verde sobre umbrales | Quitar del CI (mantener script) |
| D8 | Job programado semanal `eval-suite` + alerta de regresión | S | — | `cron.unschedule` |

---

## Fase E — Resiliencia (P2.5)

| # | Incremento | Esfuerzo | Probar | Revertir |
|---|---|---|---|---|
| E1 | `withRetry` v2: clasificación de errores + jitter + límite de reintentos facturables (Node + Deno) | M | Unit: 400 no reintenta; 529 sí; jitter en el rango | Revertir el módulo (aditivo) |
| E2 | `provider_health` + `lib/circuit-breaker` (Node + Deno); worker consulta antes de llamar | M | Test: 5 fallos → OPEN → jobs a RETRYING con espera; HALF_OPEN recupera | Flag `resiliencia.circuit_breaker` off |
| E3 | Timeouts explícitos por llamada (`AbortController`) + endurecer lease del worker | S | Test: proveedor cuelga → aborta a los 120 s → RETRYING | Subir timeouts |
| E4 | `/api/health` + `/api/ready` (Postgres + Storage + IA) | S | curl + test | Borrar rutas |
| E5 | Monitoreo sintético (Vercel Cron ejerce flujo mínimo e2e) + alerta | S | Forzar fallo, ver alerta | `cron.unschedule` |
| E6 | Degradación en UI cuando breaker OPEN (deshabilitar botón + aviso) | S | Playwright con breaker forzado OPEN | Flag |

---

## Fase F — Rendimiento (P2.4) — *medir antes de optimizar*

| # | Incremento | Esfuerzo | Probar | Revertir |
|---|---|---|---|---|
| F1 | Instrumentación: Web Vitals reales, timing de API (middleware de `apiRoute()`), `pg_stat_statements`, duración de jobs, tamaño de bundle por ruta en CI. **Recolectar baseline 1–2 semanas.** | M | Dashboard con datos | Quitar instrumentación |
| F2 | Presupuestos de rendimiento en CI (bundle size, Lighthouse CI en preview) | S | CI falla si se rebasa | Quitar el gate |
| F3 | Frontend: lazy load visor PDF / TipTap / gráficas; virtualizar tablas grandes; paginación consistente; control de suscripciones Realtime | L | Lighthouse antes/después; bundle antes/después | Por componente, aditivo |
| F4 | Backend: revisar índices, quitar `select("*")`, paginar, reducir N+1, `EXPLAIN ANALYZE` del top-10, límites/timeouts de query | L | p95 antes/después; planes de consulta | Por query |
| F5 | pgvector: tunear `hnsw.ef_search`, medir recall/latencia; `search_chunks` con timeout | M | Benchmark de recall vs latencia | Revertir parámetro |
| F6 | Retención de chunks/embeddings (job) | S | Ver Fase H | Flag |

---

## Fase G — CI/CD y entornos (P2.8)

| # | Incremento | Esfuerzo | Notas |
|---|---|---|---|
| G1 | `lib/flags.ts` + tabla `feature_flags` + seed (ADR 0008) | M | Prerequisito de casi todo lo demás — **se adelanta al inicio, antes de Fase B** |
| G2 | `supabase/config.toml` + crear proyecto **staging** + migrar secretos a "Production" explícito + set "Preview/Staging" | M | Requiere acceso a la cuenta Supabase/Vercel del usuario |
| G3 | `.github/workflows/ci.yml` (lint, tsc, build, unit, integration, migrations-check, npm audit, CodeQL, gitleaks) | M | |
| G4 | `preview.yml` + `smoke.yml` (Playwright contra preview, incl. un job e2e) | M | |
| G5 | `staging.yml` + `production.yml` (environment con required reviewers, backup previo, migraciones verificadas, registro de versión) | M | |
| G6 | `CHANGELOG.md`, release notes template, protección de `main`, CODEOWNERS, Dependabot/Renovate | S | |
| G7 | Convención expand→migrate→contract para migraciones no aditivas + linter de migraciones destructivas | S | |

---

## Fase H — Datos, retención, DR (P2.6 / P2.7)

| # | Incremento | Esfuerzo | Notas |
|---|---|---|---|
| H1 | `08-clasificacion-datos.md` completo + etiquetas por tabla/bucket | S | Documento |
| H2 | `data_retention_policy` + jobs de limpieza (rate_limit_hits, ai_usage_log, jobs, chunks) | M | Flag `retencion.limpieza_automatica`, arranca en dry-run (loguea qué borraría) |
| H3 | `audit_log` append-only hash-encadenado + escritura desde acciones críticas | M | |
| H4 | Job `exportar-organizacion` (ZIP + URL firmada) | M | |
| H5 | `deletion_requests` + job `borrar-organizacion` orquestado (ADR 0010) con ventana de gracia | L | Probar en staging con una org de prueba; verificar Storage vacío, sesiones revocadas |
| H6 | Backups: `pg_dump` diario a bucket cifrado + sync semanal de Storage + export de config/flags | M | |
| H7 | **Prueba de restauración real** a proyecto aislado + suite de integración + medir RTO + documentar | L | Obligatorio por criterio de terminación |
| H8 | Decisión y (si se aprueba) activación de PITR de Supabase Pro | S | Depende de aprobación de costo |
| H9 | Runbooks de corrupción de migraciones y borrado accidental | S | |

---

## Fase I — Operación y producto (P2.9 / P2.10)

| # | Incremento | Esfuerzo | Notas |
|---|---|---|---|
| I1 | Dashboard de salud interno `/admin/salud` (jobs, DLQ, breakers, consumo IA, 5xx, Web Vitals) | M | |
| I2 | Alertas por severidad (SEV1/2/3) → Sentry + webhook | S | |
| I3 | SLO + error budgets documentados + medición automática | M | `09-slo-y-alertas.md` |
| I4 | Runbooks: revocación de sesiones, fuga de datos, consumo anormal de IA, documento malicioso, falla de migración, DLQ, proveedor caído | M | `runbooks/` |
| I5 | Registro de incidentes + template de postmortem sin culpables | S | |
| I6 | Producto: página de estado, historial de actividad, avisos "IA requiere revisión humana", consentimiento/términos, planes↔`ai_org_policy` | L | |
| I7 | Métricas de valor (tiempo ahorrado, requisitos detectados, omisiones evitadas, tasa de aceptación humana, coste por expediente) | M | Deriva de `jobs` + `ai_results` + `audit_log` |
| I8 | Roles/permisos configurables sobre el modelo base + config por jurisdicción + versionado de formatos legales | L | |

---

## Fase J — Pruebas de aceptación (P2, cierre)

Ejecutar y documentar en `10-pruebas-aceptacion.md`:
carga concurrente multi-org · procesamiento simultáneo · reintentos y fallos parciales · caída simulada de Anthropic / OpenAI / correo · job duplicado · documento repetido · cancelación · presupuesto agotado · timeout · restauración de backup · rollback de app · migración fallida · aislamiento multi-tenant bajo carga · rendimiento de RLS · accesibilidad · Core Web Vitals · escaneo de seguridad · regresión completa (145 tests P0/P1 + nuevos).

Herramienta de carga: **k6** o **Artillery** (script en `tests/load/`, no infra permanente).

---

## Orden recomendado

**G1 (flags) → Fase A → G2 (staging) → B1 (piloto) → C1–C3 (costo mínimo) → D1–D3 (versionado) → resto de B → E → F → G3–G7 → H → I → J.**

Racional: los flags desbloquean todo; los cimientos de jobs son prerequisito; un piloto (B1) valida el modelo antes de migrar las 10; costo y versionado deben existir antes de mover volumen real; staging (G2) debe estar listo antes de cualquier consideración de despliegue.

## Rollback global

Ningún incremento pasa a producción sin autorización. Cada uno es reversible por: (a) bajar su feature flag, (b) `git revert` del commit, (c) rollback de deploy en Vercel/Supabase, (d) para migraciones, solo aditivas o expand/contract. El detalle por incremento está en las tablas de arriba. Ver también `04-rollback-y-dr.md`.
