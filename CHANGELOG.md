# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es/1.1.0/).
Las release notes de cada despliegue a producción se generan automáticamente
en GitHub Releases (workflow `production.yml`); este archivo resume los
bloques mayores.

## [No publicado] — rama `architecture/p2-production-readiness`

Evolución de MVP a plataforma SaaS de producción (fase P2). **Nada
desplegado**; todo detrás de feature flags apagados.

### Añadido

- **Sistema de jobs asíncronos** (`public.jobs`): OCR, embeddings, análisis
  de IA y auditorías salen de la petición HTTP del cliente. Estado,
  progreso, reintentos con backoff+jitter, idempotencia, cancelación
  cooperativa, dead-letter queue, reanudación por steps, notificación por
  Realtime + email. Worker en Edge Function disparado por Vercel Cron +
  pg_cron.
- **Gobierno de costo de IA por organización**: cuotas mensual/diaria/por
  operación, ledger append-only con reserva → conciliación → liberación,
  estimación de tokens, catálogo de precios.
- **Trazabilidad y versionado de resultados de IA** (`ai_results`
  append-only): nunca se sobrescribe un resultado; corrección = fila nueva
  con `reemplaza_a`. `prompt_templates` versionados, citas de evidencia,
  aprobación humana, flujo "reportar resultado incorrecto", historial.
- **Resiliencia**: circuit breakers por proveedor (`provider_health`),
  reintentos clasificados, timeouts explícitos, `/api/health`,
  `/api/ready`, monitoreo sintético, degradación de UI cuando un proveedor
  está caído.
- **CI/CD**: workflows de calidad (typecheck, lint, lint de migraciones,
  audit, build), tests unitarios y de integración/e2e contra Supabase
  local, deno check, escaneo de secretos, CodeQL. Despliegue a staging y
  producción con respaldo previo, verificación de migraciones y aprobación
  manual. Dependabot, CODEOWNERS, plantilla de PR.

### Sin cambios de comportamiento

Con todos los flags apagados, la aplicación se comporta exactamente igual
que antes de P2.

---

## Fases previas

- **P1** — capa común de API (`apiRoute()`), sobre de respuesta uniforme,
  auditoría e inicio de migración de las 59 rutas, 145 tests.
- **P0** — endurecimiento de seguridad multi-tenant (signup, Edge
  Functions, e.firma, xlsx→exceljs, storage MIME, prompt-injection guard,
  tope de gasto de IA).
