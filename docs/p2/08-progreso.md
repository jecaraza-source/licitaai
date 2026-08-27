# P2 — Progreso de implementación

Rama `architecture/p2-production-readiness`. Nada desplegado a producción. Todo detrás de feature flags (apagados) salvo la infraestructura inerte.

## Completado

| Incremento | Commit | Qué entrega | Tests |
|---|---|---|---|
| **G1** — Feature flags | `93ecd1d` | Tabla `feature_flags` + `src/lib/flags.ts` + gemelo Deno + opción `flags` en `apiRoute()`. Seed de 17 flags P2, apagados. | 18 unit + 8 integración |
| **A1** — Esquema de jobs | `e42749e` | `public.jobs` (fuente de verdad única) + `jobs_dead_letter` + RLS + RPCs `crear_job`/`cancelar_job` + funciones del worker (`reclamar_jobs` con `FOR UPDATE SKIP LOCKED`, `progreso_job`, `completar_job`, `fallar_job` con backoff+jitter, `reencolar_step_job`, `expirar_jobs`). | 24 integración |
| **A2** — Worker | `32bf1cb` | Edge Function `job-worker` + `_shared/job-runner.ts` (ejecución por steps, cancelación cooperativa, clasificación de errores) + handler `noop` + `_shared/worker-auth.ts`. `marcar_job_cancelado`. | 17 integración |
| **A3** — Disparadores | `7bd0bd5` | `GET /api/cron/job-worker` + Vercel Cron 1 min (primario). pg_cron `expirar_jobs` 1 min + `disparar_worker()`/`app_settings` para el tick HTTP opcional de 10s. `supabase/config.toml` al repo. | 6 integración |
| **A4** — API de jobs | `c76c53d` | `POST /api/jobs` (flag `jobs.api`), `GET /api/jobs`, `GET /api/jobs/:id`, `POST /api/jobs/:id/cancel`. `src/lib/jobs.ts` (`crearJob`, `proyectarJobPublico`, `mapearErrorRpcJob`). | 9 e2e |
| **A5** — Realtime + UI | `8a52dc0` | `jobs` en publicación Realtime. `src/hooks/use-job.ts` (polling con backoff + Realtime). `<JobStatus>`. Tipo `Job` en `@/types`. | 5 integración |
| **A6** — Notificación | `5f319b3` | `jobs.notificado_at` + `marcar_job_notificado` (guard atómico). `_shared/job-notify.ts` (Resend REST, > 60s, idempotente). | 7 integración |
| **B1** — procesar-documento vía jobs | `d1efbf5` | Handler multi-step `_shared/job-handlers/procesar-documento.ts` (extraer → chunk → embeddings lote a lote → finalizar; idempotente; `MOCK_AI` sin keys). Ruta `licitaciones/[id]/procesar-documento` bifurca por flag `jobs.async_procesar_documento` (202 + job_id / sync). `registrar_uso_ia_worker` (service_role). Frontend sin cambios (fire-and-forget + Realtime de `documentos`). | 11 integración + 3 e2e |
| **C1** — esquema de gobierno de costo IA | _(este commit)_ | `ai_org_policy` (cuota mensual/diario/por-operación, modelos permitidos, política de modelo), `ai_model_pricing` (seed con precios actuales), `ai_budget_ledger` (append-only). RPCs `reservar_presupuesto_ia` / `conciliar_presupuesto_ia` / `liberar_reserva_ia` / `estimar_costo_ia` / `presupuesto_ia_disponible`. `gastado = Σ(RESERVADO)+Σ(CONSUMIDO)−Σ(LIBERADO)`. | 20 integración |
| **C2** — reserva en la creación del job | _(este commit)_ | `src/lib/ai-estimate.ts` (estimación tokens/costo por tipo). `crearJobConPresupuesto()` (flag `ai.gobierno_costo`): idempotencia → reservar → `crear_job(p_reserva_id)` → libera si falla. Errores de presupuesto → 429 `AI_BUDGET_EXCEEDED`. `crear_job` gana `p_reserva_id`. Rutas `procesar-documento` y `/api/jobs` integradas. | (cubierto en C2/C3) |
| **C3** — conciliación por el worker | `792b38a` | `job-runner` concilia la reserva al COMPLETAR (con los tokens/modelo reales) y la libera al FALLAR/CANCELAR. `procesar-documento` acumula tokens entre steps. | 10 integración (C2+C3) |
| **D1** — esquema de trazabilidad IA | _(este commit)_ | `ai_results` append-only (nunca UPDATE de `resultado_json`; corrección = fila nueva con `reemplaza_a`), `prompt_templates` versionados (RLS: solo service_role), `ai_result_citations`. RPC `persistir_resultado_ia` (vía de escritura de los handlers de Fase B) + `aprobar_resultado_ia` (D5). Punteros `ai_result_id` en `analisis_bases`/`estudio_mercado`. | 15 integración |
| **D2** — prompts a `prompt_templates` | _(este commit)_ | Seed de los prompts actuales como version 1 (`procesar-documento-extraccion`, `preguntar-rag`); el resto se siembra al migrar cada operación. `conGuardia()` se sigue aplicando encima. | (cubierto en D1) |
| **D3** — historial + revisión | `763d920` | Backfill de `analisis_bases`/`estudio_mercado` → `ai_results` (`origen=backfill_p2`, `APROBADO`). `GET /api/licitaciones/[id]/ai-results` (todas las versiones + citas + versión activa). `POST /api/ai-results/[id]/revision` (APROBADO/RECHAZADO; el motivo de rechazo = flujo "reportar resultado incorrecto" D6, va a `actividad_log`). | 5 e2e |
| **B2–B10** — resto de operaciones a jobs | `e24e269` | Wrapper `handlerInvocaEF`: cada operación de IA se ejecuta invocando su Edge Function existente en "modo job" (`authenticate({ permitirJob: true })` — service key + `job_id`; la EF conserva su lógica intacta). El worker orquesta estado/reintentos/idempotencia/notificación/conciliación de costo (C3) + trazabilidad `ai_results` (D3, tras `ai.versionado_resultados`). Rutas: `analizar-bases`, `estudio-mercado`, `junta/generar`, `propuesta-tecnica/generar`, `checklist-items/[itemId]/documento` (auditar-documento), `seguimiento/analizar-fallo`, `empresa-perfil/.../analizar` bifurcan por su flag → 202. **B7**: `auditar-todos` reemplaza el fan-out en serie por N jobs `auditar-documento` (prioridad de lote) + 1 `auditar-expediente`. **B8**: nueva Edge Function `analizar-fallo` (antes SDK directo en la ruta). | 9 integración + 8 e2e |
| **E1** — retry v2 | _(este commit)_ | `_shared/retry.ts` reescrito: clasificación de errores (`esReintentable` — 4xx / credenciales no; 429/5xx/timeout sí), backoff exponencial con **jitter** + tope, respeta `Retry-After`, timeout por intento. `esReintentable`/`ErrorNoReintentable` movidos aquí (compartidos con el worker). | 18 unit |
| **E2** — circuit breakers | _(este commit)_ | `provider_health` (anthropic/openai/resend) + máquina de estados CLOSED→OPEN→HALF_OPEN→CLOSED. RPCs `cb_estado`/`cb_registrar_exito`/`cb_registrar_fallo`/`reencolar_por_espera`. `_shared/circuit-breaker.ts` (`conBreaker`) integrado en `invocar-ef` (anthropic) y `procesar-documento` (anthropic + openai). Con el circuito OPEN el worker deja el job en RETRYING con espera larga y **sin consumir presupuesto de reintentos**. Flag `resiliencia.circuit_breaker`. | 16 integración |
| **E3** — timeouts | _(este commit)_ | Timeout duro por invocación de Edge Function en `invocar-ef` (`Promise.race`); `withRetry` con `timeoutMs` por intento. | (en E1/E2) |
| **E4** — health / readiness | _(este commit)_ | `GET /api/health` (liveness, sin auth ni DB); `GET /api/ready` (Postgres + Storage + estado de breakers → 200 / 503). | 2 e2e |
| **E5** — monitoreo sintético | _(este commit)_ | `GET /api/cron/monitoreo` (Vercel Cron cada 10 min): DLQ, tasa de fallo de jobs 1h, jobs atascados sin arrancar, breakers abiertos → Sentry `captureMessage` (warning/error). | — |
| **E6** — degradación en UI | `c1906ae` | `GET /api/estado-ia` + hook `useEstadoIA` → los botones de IA se deshabilitan con aviso cuando un circuito está abierto (integrado en `analisis-ia-tab`; patrón para el resto). | 1 e2e |
| **fix seguridad** — grants del worker | `0df1bc1` | Revoca `EXECUTE` de `anon`/`authenticated` en las 21 funciones del worker (Supabase las auto-concede por default privileges; `revoke from public` no basta). Sin esto un usuario autenticado podía `reclamar_jobs` (fuga cross-org), `cb_registrar_fallo` (DoS), `persistir_resultado_ia`, `conciliar_presupuesto_ia`, etc. | 18 integración |
| **G3–G7** — CI/CD | `c557cdf` | `ci.yml` reescrito (typecheck, lint, **lint:migrations**, `npm audit`, build, deno check, unit, integración + e2e contra Supabase local, gitleaks); `codeql.yml`; `staging.yml` / `production.yml` (respaldo previo con `db dump`, verificación de migraciones contra base limpia, aprobación manual vía Environment, smoke, tag+release). `scripts/lint-migraciones.mjs` (G7: bloquea DROP/TRUNCATE/ALTER TYPE sin marca `-- safe:`/`-- expand-contract:`), `scripts/smoke.mjs`, `scripts/test-runner.mjs`. `CODEOWNERS`, `dependabot.yml`, plantilla de PR, `CHANGELOG.md`. `package.json`: `check`, `typecheck`, `test:*`, `lint:migrations`. | — (scripts verificados en local; workflows validados sintácticamente) |

| **F** — rendimiento | `4e37d29` | **F1** instrumentación: `apiRoute()` añade `Server-Timing` + log `[api:slow]` (>800 ms); `pg_stat_statements`; arranque de jobs ya en `/admin/salud`. **F2** presupuesto de bundle (`scripts/check-bundle.mjs` + `perf-budgets.json`, gate de CI): total JS cliente ≤ 1500 KB gz, chunk mayor ≤ 320 KB gz. **F3** code-split de las 6 pestañas pesadas de la licitación (`next/dynamic`), `react-pdf` con `ssr:false`, `exceljs` a `await import()` en el handler. **F4** índices por patrones de P2 + `statement_timeout` en `search_chunks`/`metricas_operacion`/`presupuesto_ia_disponible` + `match_count` acotado. **F5** `search_chunks` fija `hnsw.ef_search=40` explícito (calibrable con recall real). `docs/p2/11-rendimiento.md`. Lo dirigido por datos de producción (top-10 de consultas, objetivos de CWV como gate) queda pendiente de baseline. | 6 integración + 1 e2e |
| **I** — operación y soporte | `059199a` | `metricas_operacion()` (jobs por estado, arranque p50/p95, jobs sin intervención %, DLQ, atascados, circuit breakers, consumo IA por org vs cuota, flags activos). `GET /api/admin/salud` + página `/admin/salud` (client, refresco 30 s) gated por `PLATFORM_ADMIN_EMAILS` (fail-closed). `/api/cron/monitoreo` con clasificación **SEV1/SEV2/SEV3** → Sentry (`fatal`/`error`/`warning`) + webhook opcional (`ALERTAS_WEBHOOK_URL`). `docs/p2/10-slo-y-alertas.md` (SLO + error budgets + severidad + matriz de responsables + procedimiento de incidente). **8 runbooks** (`docs/p2/runbooks/`): proveedor caído, DLQ, worker parado, consumo anormal de IA, migración fallida, revocar sesiones, fuga de datos, documento malicioso. Plantillas de issue `incidente` / `postmortem`. | 10 integración + 3 e2e |

| **I6–I8** — preparación de producto | _(este commit)_ | `audit_log` **inmutable encadenado por hash** (`registrar_auditoria` / `verificar_cadena_auditoria`; triggers anti UPDATE/DELETE) cableado en envío de licitación, revisión de resultado IA y aceptación de términos. Consentimiento de términos (`users.terminos_*`, `/terminos` + gate, `POST /api/terminos/aceptar`). Planes comerciales (`organizations.plan` + `aplicar_plan_a_org` → `ai_org_policy`). Página de estado pública `/estado` + `GET /api/estado`. `metricas_valor()` + `/api/organizacion/metricas-valor` + `<MetricasValorCard>` (tasa de aceptación humana, coste por expediente, requisitos detectados…). `GET /api/organizacion/actividad` (historial + bitácora). `<AvisoRevisionIA>`. `organizations.jurisdiccion`. Roles configurables y versionado de formatos legales: diseñados como follow-up (`12-producto.md`). | 14 integración + 4 e2e |

| **H1–H2** — clasificación de datos + retención | _(este commit)_ | `docs/p2/13-clasificacion-datos.md` (8 clases de dato; etiqueta por tabla, bucket y sistema externo; qué pasa con cada una al borrar usuario/organización). Migración: `data_retention_policy` (1 fila por recurso, `activo`/`dry_run`, **todo arranca apagado y en dry-run**), `retencion_archive` (archivo frío jsonb append-only, inmutable como `audit_log`), `ejecutar_limpieza_retencion(p_forzar_dry_run)` (service_role; archiva→borra; nunca lanza; registra `ultimo_resultado` por recurso). 7 recursos: `rate_limit_hits` (7 d), `ai_usage_log`/`ai_budget_ledger` (13 m → archivo), `jobs` terminales (90 d → archivo), `jobs_dead_letter` (180 d), `actividad_log` (24 m), embeddings de licitaciones CERRADAS (12 m). `GET /api/cron/retencion` (Vercel Cron diario): con el flag `retencion.limpieza_automatica` OFF corre en modo observación (fuerza dry-run global). | 19 integración |
| **H3** — auditoría inmutable | (entregado en I6, `3447a0f`) | `audit_log` encadenado por hash + `registrar_auditoria` / `verificar_cadena_auditoria`. |
| **H4** — export de organización | `5a27c4e` | Job `exportar-organizacion` (handler propio, sin IA). `exportar_datos_organizacion(org)` → bundle jsonb con ~30 tablas de dominio (sin embeddings ni catálogos globales); `service_role`. El handler sube `export.json` + `manifiesto.json` (con `sha256` del export y el inventario de Storage por bucket) al bucket **privado** `exportaciones/{org}/{job_id}/` y devuelve una **URL firmada de 72 h**. `POST/GET /api/organizacion/exportar` (ADMIN, flag `datos.export_organizacion`, idempotente por ventana de 10 min). `/api/jobs` rechaza este tipo (ruta dedicada). | 16 integración + 1 e2e |
| **H5** — borrado de organización orquestado | `60f7bcb` | `deletion_requests` + ventana de gracia de 7 días. `solicitar_borrado_organizacion(nombre_exacto)` (ADMIN; confirmación = nombre de la org; encola el export) · `cancelar_borrado_organizacion()` (revierte en la gracia) · `promover_borrados_vencidos()` / `finalizar_borrados_completados()` (cron `/api/cron/borrados` diario). Job **multi-step** `borrar-organizacion`: preparar (manifiesto) → revocar (sesiones + refresh tokens) → storage (borra `{org}/` en los 5 buckets) → purgar (cancela jobs en vuelo; **sella** `audit_log` + `retencion_archive` con el `sha256` del manifiesto; borra `auth.users`). El `DELETE FROM organizations` (cascade) lo hace el cron, **fuera del job** (borraría su propia fila). `ON DELETE CASCADE` es el último paso, no el plan. H5 quita las FK `audit_log.organization_id`/`actor_id` (una bitácora inmutable no puede perder el id original; `verificar_cadena_auditoria(org)` sigue válido tras el borrado). Rutas `POST/GET /api/organizacion/borrar` + `/cancelar` (ADMIN, flag `datos.borrado_organizacion`). Runbook `runbooks/borrar-organizacion.md`. | 26 integración + 1 e2e |
| **H6** — backup + snapshot de config | `f7df60f` | `scripts/backup-db.mjs` (`pg_dump` → gzip → cifrado AES-256 con `openssl` → verificación de integridad descifrando + `gunzip -t`), `scripts/backup-storage.mjs` (manifiesto + checksums muestreados; `BACKUP_STORAGE_FULL=1` descarga todo), `scripts/backup-config.mjs` (`feature_flags`/`ai_org_policy`/`ai_model_pricing`/`data_retention_policy` → `supabase/config-snapshot/*.json` versionado en git), `scripts/restore-verify.mjs` (H7: conteos + funciones + cadena de auditoría contra un proyecto restaurado). `.github/workflows/backup.yml` (diario; se auto-salta sin secrets — infra no autorizada). `docs/p2/14-backup-y-restauracion.md` (qué se respalda, RPO/RTO, procedimiento de drill, **decisión de PITR H8**). | scripts verificados en local (config + storage) |

| **J** — pruebas de aceptación bajo carga | _(este commit)_ | `tests/load/carga-local.mjs` (carga directa a Postgres, sin k6: N orgs × M jobs concurrentes + K workers → verifica **cero doble-procesamiento**, aislamiento multi-tenant bajo carga, idempotencia, cancelación, cola drenada; 500 jobs, creación p95 ~168 ms, ~233 jobs/s). `tests/load/api-jobs.k6.js` + `gen-tokens.mjs` (carga HTTP del stack completo, requiere k6). `tests/e2e/p2-j-accesibilidad.spec.ts` (smoke: `lang`, un `h1`, campos y botones con nombre — arregló los `<h1>` faltantes en `/login` y `/register` vía `CardTitle as="h1"`). `docs/p2/15-pruebas-aceptacion.md`: matriz de los 19 escenarios del brief → evidencia (casi todo ya cubierto por las suites de P2). Pendiente por infra/keys, no por código: drill de restauración real, auditoría de accesibilidad con lector de pantalla, CWV de campo, carga con IA real. | `test:load` verde + 3 e2e |

**Verificación acumulada:** `npm run check` (typecheck + lint + lint:migrations) limpio · `npm run lint` sin errores nuevos (2 warnings baseline) · `deno check` limpio (salvo el gap pre-existente `web_search_20260209`, docs P0 §7) · 10 suites unit (63 casos) · 18 suites integración P2 (295 casos) · 57 e2e · carga (`test:load`) verde · tests P0/P1 sin regresión.

## Migraciones nuevas (todas aditivas)

```
20260827000000_p2_feature_flags
20260827001000_p2_jobs
20260827002000_p2_jobs_worker_cancel
20260827003000_p2_jobs_cron
20260827004000_p2_jobs_api_flag
20260827005000_p2_jobs_realtime
20260827006000_p2_jobs_notificacion
20260827007000_p2_b1_uso_ia_worker
20260828000000_p2_c1_gobierno_costo_ia
20260828001000_p2_c2_crear_job_reserva
20260828010000_p2_d1_ai_results
20260828020000_p2_b_prompt_templates
20260828021000_p2_b_job_tipo_noop_ef
20260829000000_p2_e2_provider_health
20260830000000_p2_i_metricas_operacion
20260830001000_p2_fix_grants_service_role
20260831000000_p2_f_rendimiento
20260901000000_p2_i6_producto
20260902000000_p2_h2_retencion
20260903000000_p2_h4_exportar
20260904000000_p2_h5_borrado
```

Rollback de cada una: comentario `-- Rollback:` al inicio del archivo. Ninguna toca datos existentes (H5 quita dos FK de `audit_log`, marcadas `-- safe:` — no pierde datos).

## Estado de los flags (todos OFF)

`jobs.api` · `jobs.async_*` (10) · `ai.gobierno_costo` · `ai.cache` · `ai.versionado_resultados` · `resiliencia.circuit_breaker` · `perf.virtualizar_tablas` · `retencion.limpieza_automatica` · `datos.export_organizacion` · `datos.borrado_organizacion`

## Notas de entorno

- En esta máquina (colima), `supabase stop && start` falla al montar el socket del contenedor `vector`. Usar `supabase start --exclude vector,imgproxy,pooler`. `supabase db reset` no se ve afectado.
- El edge runtime local no hace hot-reload de funciones nuevas: tras añadir una Edge Function o un `_shared/*` nuevo, `docker restart supabase_edge_runtime_licitaai` (o el `--exclude` de arriba).
- Secretos que producción necesitará y que hoy no están en local: `JOB_WORKER_SECRET` (o reutilizar `CRON_SECRET`), y para A6 `RESEND_API_KEY` ya existente.

## Siguiente

**Todas las fases de implementación (A–J) están completas.** Lo que queda no
es código:

- **G2 / staging** (pendiente de autorización): crear proyecto Supabase de staging, cargar secrets/vars de GitHub, activar branch protection + Environment `production` con required reviewers. Los workflows ya referencian esos nombres.
- **H7 (drill de restauración) / H8 (activar PITR)** — código y procedimiento listos (`scripts/restore-verify.mjs`, `docs/p2/14-backup-y-restauracion.md`); el drill se corre en cuanto haya un proyecto Supabase donde restaurar. Falta la aceptación formal del RPO de 24 h o la aprobación de PITR (~$100/mes).
- **J — carga con IA real / auditoría de accesibilidad con lector de pantalla / CWV de campo** — requieren API keys + presupuesto, y un despliegue con tiempo de operación. Matriz en `docs/p2/15-pruebas-aceptacion.md` §6.
- **B11** (post-despliegue) — retirar el modo síncrono de cada operación tras subir su flag a 100% y ~2 semanas estable.
- **B follow-up** — para las operaciones que rebasen el wall-clock de Edge Functions (propuesta técnica, estudio de mercado con web_search), re-partir en steps como `procesar-documento` (riesgo R1). Medir primero.

El código de P2 está listo para autorización de despliegue a staging.

Todos los flags `jobs.async_*` / `ai.*` siguen **OFF**. Activación gradual por organización tras despliegue autorizado a staging.
