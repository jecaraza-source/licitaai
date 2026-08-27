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

| **I** — operación y soporte | _(este commit)_ | `metricas_operacion()` (jobs por estado, arranque p50/p95, jobs sin intervención %, DLQ, atascados, circuit breakers, consumo IA por org vs cuota, flags activos). `GET /api/admin/salud` + página `/admin/salud` (client, refresco 30 s) gated por `PLATFORM_ADMIN_EMAILS` (fail-closed). `/api/cron/monitoreo` con clasificación **SEV1/SEV2/SEV3** → Sentry (`fatal`/`error`/`warning`) + webhook opcional (`ALERTAS_WEBHOOK_URL`). `docs/p2/10-slo-y-alertas.md` (SLO + error budgets + severidad + matriz de responsables + procedimiento de incidente). **8 runbooks** (`docs/p2/runbooks/`): proveedor caído, DLQ, worker parado, consumo anormal de IA, migración fallida, revocar sesiones, fuga de datos, documento malicioso. Plantillas de issue `incidente` / `postmortem`. | 10 integración + 3 e2e |

**Verificación acumulada:** `npm run check` (typecheck + lint + lint:migrations) limpio · `npm run lint` sin errores nuevos (2 warnings baseline) · `deno check` limpio (salvo el gap pre-existente `web_search_20260209`, docs P0 §7) · 10 suites unit (63 casos) · 14 suites integración P2 (189 casos) · 51 e2e · tests P0/P1 sin regresión.

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
```

Rollback de cada una: comentario `-- Rollback:` al inicio del archivo. Ninguna toca datos existentes.

## Estado de los flags (todos OFF)

`jobs.api` · `jobs.async_*` (10) · `ai.gobierno_costo` · `ai.cache` · `ai.versionado_resultados` · `resiliencia.circuit_breaker` · `perf.virtualizar_tablas` · `retencion.limpieza_automatica`

## Notas de entorno

- En esta máquina (colima), `supabase stop && start` falla al montar el socket del contenedor `vector`. Usar `supabase start --exclude vector,imgproxy,pooler`. `supabase db reset` no se ve afectado.
- El edge runtime local no hace hot-reload de funciones nuevas: tras añadir una Edge Function o un `_shared/*` nuevo, `docker restart supabase_edge_runtime_licitaai` (o el `--exclude` de arriba).
- Secretos que producción necesitará y que hoy no están en local: `JOB_WORKER_SECRET` (o reutilizar `CRON_SECRET`), y para A6 `RESEND_API_KEY` ya existente.

## Siguiente

Fase A + B (jobs) y C + D (costo + trazabilidad) completas. Queda:

- **B11** — retirar el modo síncrono de cada operación (subir su flag a 100%, esperar ~2 semanas estable, borrar el código sync). Solo tras despliegue autorizado.
- **B follow-up** — para las operaciones que rebasen el wall-clock de Edge Functions (propuesta técnica, estudio de mercado con web_search), re-partir en steps como `procesar-documento` (riesgo R1). Medir primero.
- **F** (rendimiento + presupuestos), **H** (retención/DR + prueba de restauración), **J** (pruebas de aceptación bajo carga).
- **G2** (pendiente de autorización): crear proyecto Supabase de staging, cargar secrets/vars de GitHub, activar branch protection + Environment `production` con required reviewers. Los workflows ya referencian esos nombres.

Todos los flags `jobs.async_*` / `ai.*` siguen **OFF**. Activación gradual por organización tras despliegue autorizado a staging.
