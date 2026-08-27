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
| **D3** — historial + revisión | _(este commit)_ | Backfill de `analisis_bases`/`estudio_mercado` → `ai_results` (`origen=backfill_p2`, `APROBADO`). `GET /api/licitaciones/[id]/ai-results` (todas las versiones + citas + versión activa). `POST /api/ai-results/[id]/revision` (APROBADO/RECHAZADO; el motivo de rechazo = flujo "reportar resultado incorrecto" D6, va a `actividad_log`). | 5 e2e |

**Verificación acumulada:** `tsc` limpio · `npm run lint` sin errores nuevos (2 warnings baseline) · `deno check` limpio · 9 suites unit · 10 suites integración P2 (127 casos) · 37 e2e · tests P0/P1 sin regresión.

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
```

Rollback de cada una: comentario `-- Rollback:` al inicio del archivo. Ninguna toca datos existentes.

## Estado de los flags (todos OFF)

`jobs.api` · `jobs.async_*` (10) · `ai.gobierno_costo` · `ai.cache` · `ai.versionado_resultados` · `resiliencia.circuit_breaker` · `perf.virtualizar_tablas` · `retencion.limpieza_automatica`

## Notas de entorno

- En esta máquina (colima), `supabase stop && start` falla al montar el socket del contenedor `vector`. Usar `supabase start --exclude vector,imgproxy,pooler`. `supabase db reset` no se ve afectado.
- El edge runtime local no hace hot-reload de funciones nuevas: tras añadir una Edge Function o un `_shared/*` nuevo, `docker restart supabase_edge_runtime_licitaai` (o el `--exclude` de arriba).
- Secretos que producción necesitará y que hoy no están en local: `JOB_WORKER_SECRET` (o reutilizar `CRON_SECRET`), y para A6 `RESEND_API_KEY` ya existente.

## Siguiente

**Resto de operaciones a jobs (B2–B11)**, cada una: refactor de su Edge Function a handler(s) de step + persistencia vía `persistir_resultado_ia` (con citas) + seed de su prompt en `prompt_templates` + política de modelo (económico por defecto) + flag `jobs.async_<tipo>`. Empezar por **B2 (`analizar-bases`)** — ya valida su salida contra JSON Schema (P0.6), es el mejor caso para estrenar el versionado.

Flags OFF pendientes de activación gradual: `ai.gobierno_costo` (tras calibrar estimaciones, R3), `ai.versionado_resultados` (cuando B2+ escriban `ai_results`), `jobs.async_procesar_documento` (piloto).
