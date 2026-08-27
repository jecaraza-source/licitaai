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

**Verificación acumulada:** `tsc` limpio · `npm run lint` sin errores nuevos (2 warnings baseline) · `deno check` limpio · 9 suites unit · 6 suites integración P2 (73 casos) · 19 e2e (10 P1 + 9 P2) · 76 tests de integración P0 y 145 P0/P1 sin regresión.

## Migraciones nuevas (todas aditivas)

```
20260827000000_p2_feature_flags
20260827001000_p2_jobs
20260827002000_p2_jobs_worker_cancel
20260827003000_p2_jobs_cron
20260827004000_p2_jobs_api_flag
20260827005000_p2_jobs_realtime
20260827006000_p2_jobs_notificacion
```

Rollback de cada una: comentario `-- Rollback:` al inicio del archivo. Ninguna toca datos existentes.

## Estado de los flags (todos OFF)

`jobs.api` · `jobs.async_*` (10) · `ai.gobierno_costo` · `ai.cache` · `ai.versionado_resultados` · `resiliencia.circuit_breaker` · `perf.virtualizar_tablas` · `retencion.limpieza_automatica`

## Notas de entorno

- En esta máquina (colima), `supabase stop && start` falla al montar el socket del contenedor `vector`. Usar `supabase start --exclude vector,imgproxy,pooler`. `supabase db reset` no se ve afectado.
- El edge runtime local no hace hot-reload de funciones nuevas: tras añadir una Edge Function o un `_shared/*` nuevo, `docker restart supabase_edge_runtime_licitaai` (o el `--exclude` de arriba).
- Secretos que producción necesitará y que hoy no están en local: `JOB_WORKER_SECRET` (o reutilizar `CRON_SECRET`), y para A6 `RESEND_API_KEY` ya existente.

## Siguiente

**Fase B** — migrar las operaciones reales al sistema de jobs, una por una, cada una tras su flag `jobs.async_<tipo>`. Empezar por **B1 (`procesar-documento`)** como piloto del modelo multi-step. Ver [03-plan-incremental.md](03-plan-incremental.md) §B.

Antes de Fase B conviene decidir: **C1–C3 (gobierno de costo mínimo)** y **D1–D3 (versionado)** deberían existir antes de mover volumen real de IA — el plan recomienda G1→A→piloto B1→C1-C3→D1-D3→resto de B.
