# P2 — Production Readiness (LicitaAI)

**Rama:** `architecture/p2-production-readiness`
**Base:** `quality/p1-stability-and-testing` (P0 y P1 implementadas, revisadas y aprobadas)
**Estado:** EN IMPLEMENTACIÓN. Diseño aprobado. **Fase A (sistema de jobs) + G1 (feature flags) completas** — ver [08-progreso.md](08-progreso.md). Nada desplegado a producción. Cada incremento tiene su commit, tests y plan de reversión.

---

## 1. Qué es LicitaAI hoy

SaaS multiempresa (Next.js 16 App Router + Supabase) para gestionar licitaciones públicas mexicanas (CompraNet / EDCA / SCA). Cada organización gestiona licitaciones, documentos confidenciales, propuestas técnicas y económicas, y usa IA (Anthropic + OpenAI) para analizar bases, hacer estudios de mercado, generar preguntas y propuestas, y auditar expedientes.

- **59 rutas** `src/app/api/**/route.ts` (1 migrada a la capa común `apiRoute()` de P1; 58 con el patrón manual anterior).
- **9 Edge Functions** Deno, todas detrás de `authenticate()` (P0.2): `analizar-bases`, `auditar-documento`, `auditar-expediente`, `generar-estudio-mercado`, `generar-preguntas-junta`, `generar-propuesta-tecnica`, `analizar-documento-corporativo`, `procesar-documento`, `procesar-referencia-legal`.
- **42 migraciones** SQL. RLS multi-tenant en todas las tablas de negocio (helpers `user_org_id()`, `licitacion_org_matches()`, etc.).
- **Controles de P0/P1 vigentes que NO se deben debilitar:** re-derivación server-side de identidad/rol/organización; JWT + org gate en cada Edge Function; firma e.firma client-side con re-verificación; allowlist MIME + magic bytes; guardia anti prompt-injection en las 15 llamadas a IA; validación de esquema de salida (`analizar-bases`); tope diario de tokens por organización (`check_ai_budget`); rate limit por minuto (`check_rate_limit`); capa común `apiRoute()` con sobre `{data,error,meta.request_id}` y redacción de logs.

## 2. El problema central que resuelve P2

**Toda operación pesada de IA/documentos corre hoy dentro de una petición HTTP abierta.** El navegador (o la ruta de Next.js) llama a una Edge Function y espera 30 s – varios minutos. Si el cliente se va, la pestaña se cierra, la función alcanza su límite de wall-clock, o el proveedor de IA tarda/falla, el trabajo se pierde a medias, sin reintento, sin rastro y a veces dejando el documento marcado como "procesado" cuando no lo está. No hay control de costo por organización más allá de un tope diario burdo, los resultados de IA se sobrescriben sin historial en varias rutas, no se puede rastrear qué fragmentos usó un análisis, no hay prueba de restauración, ni runbooks, ni separación real prod/staging.

## 3. Objetivo de P2

Convertir eso en una plataforma operable: **jobs asíncronos** con estado/progreso/reintentos/idempotencia/cancelación, **gobierno de costo de IA** por organización (reserva → ejecución → conciliación), **trazabilidad y versionado** append-only de resultados de IA con citas, **resiliencia** ante fallos de proveedor (circuit breakers, degradación), **rendimiento** medido contra presupuestos, **retención y borrado** de datos orquestado, **respaldo/restauración** probada, **CI/CD** con entornos separados y despliegue gradual, y **operación** (dashboards, alertas, runbooks, SLO).

## 4. Principio rector de infraestructura

**Primero, lo que ya ofrece la plataforma actual (Postgres + Supabase + Vercel).** No se introduce ningún proveedor nuevo salvo que un requisito medible lo exija y esté documentado en un ADR. Ver [adr/0001-sustrato-de-jobs.md](adr/0001-sustrato-de-jobs.md).

## 5. Mapa de entregables → archivos

| # | Entregable | Ubicación |
|---|---|---|
| 1 | Arquitectura actual + cuellos de botella | [01-arquitectura-actual.md](01-arquitectura-actual.md) |
| 2 | Arquitectura objetivo | [02-arquitectura-objetivo.md](02-arquitectura-objetivo.md) |
| 3 | ADRs de decisiones principales | [adr/](adr/) |
| 4–15 | Sistema de jobs, costos IA, versionado, dashboard, cargas, retención, respaldo, restauración, runbooks, SLO, pipeline | Se implementan por incremento (ver #16) |
| 16 | Plan de despliegue gradual / incrementos | [03-plan-incremental.md](03-plan-incremental.md) |
| 17 | Plan de rollback | [03-plan-incremental.md](03-plan-incremental.md) (por incremento) + [04-rollback-y-dr.md](04-rollback-y-dr.md) |
| 18 | Estimación mensual de infraestructura | [05-costos-y-limites.md](05-costos-y-limites.md) |
| 19 | Riesgos residuales | [06-riesgos-residuales.md](06-riesgos-residuales.md) |
| 20 | Borrador de PR | [07-borrador-pr.md](07-borrador-pr.md) (se completa al cierre) |

## 6. Criterio de terminación (del brief, textual)

La fase NO se declara terminada si: operaciones largas siguen dependiendo de un HTTP abierto · no hay idempotencia · no se controla costo por organización · resultados de IA se sobrescriben sin historial · no se rastrean fuentes · no hay prueba real de restauración · no hay rollback documentado · no se midió rendimiento y concurrencia · el aislamiento multi-tenant falla bajo carga · producción comparte proyecto/secretos con desarrollo · no hay alertas ni runbooks.

## 7. Orden de trabajo propuesto

P2.1 (jobs) es prerequisito de casi todo lo demás y es obligatorio por el criterio de terminación → se implementa primero. Ver [03-plan-incremental.md](03-plan-incremental.md) para la secuencia completa de incrementos.
