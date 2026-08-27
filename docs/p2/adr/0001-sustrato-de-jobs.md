# ADR 0001 — Sustrato de la cola de jobs

**Estado:** Propuesto
**Fecha:** 2026-08-26
**Contexto de:** P2.1

## Contexto

Necesitamos sacar 11 tipos de operación (OCR, extracción, chunking, embeddings, análisis de bases, estudio de mercado, generación de preguntas, propuesta técnica, auditoría documental, auditoría de expediente, análisis de fallo) de la petición HTTP. El brief exige: no introducir infraestructura innecesaria, evaluar primero opciones compatibles con la plataforma actual (Supabase + Vercel), toda complejidad nueva debe responder a una necesidad medible.

## Opciones

| Opción | Pros | Contras |
|---|---|---|
| **A. Tabla `jobs` en Postgres + `SELECT ... FOR UPDATE SKIP LOCKED` + worker (Edge Function) disparado por `pg_cron`** | Cero infra nueva. Transaccional con el resto de los datos. RLS reutilizable. Observabilidad trivial (es una tabla). Idempotencia = `unique`. Realtime ya publica cambios de tabla. | Hay que escribir el poller/lock. `pg_cron` mínimo 1 s pero práctico ~10 s. No hay "push" nativo. |
| **B. Supabase Queues (pgmq) como cola + tabla `jobs` para metadata** | pgmq da visibility timeout, archivado y reintentos listos. Sigue siendo Postgres. | pgmq y la tabla de metadata pueden divergir (dos fuentes de verdad). Extensión relativamente nueva. Aún necesitas un worker que la drene. |
| **C. Externo: QStash / Inngest / Trigger.dev** | Workers gestionados, reintentos y programación listos, dashboards. | Proveedor nuevo (contra el principio del brief). Otro secreto, otra factura, otro punto de fallo, otro lugar donde viven datos de licitaciones. Latencia de red extra. |
| **D. Vercel Cron + funciones largas (`maxDuration: 300`)** | Cero infra. | 300 s no alcanza para varios jobs. Sin cola real: no hay backpressure ni prioridad ni concurrencia por org. Es el problema actual con más tiempo. |

## Decisión

**Opción A**, con la puerta abierta a sumar pgmq (B) **solo si** la medición de P2.1 muestra contención de locks o necesidad de visibility-timeout que la tabla no cubra bien.

- La **tabla `public.jobs` es la única fuente de verdad** (estado, progreso, costo, resultado).
- Selección de trabajo: `SELECT ... WHERE estado IN ('AUTHORIZED','RETRYING') AND (lease_expires_at IS NULL OR lease_expires_at < now()) ORDER BY prioridad, created_at FOR UPDATE SKIP LOCKED LIMIT n` → previene procesamiento duplicado sin cola externa.
- Disparo del worker: `pg_cron` cada 10 s (`net.http_post`) como primario; Vercel Cron cada 1 min como respaldo; Database Webhook opcional en `INSERT` para arranque inmediato de jobs interactivos.
- Idempotencia: `unique (organization_id, idempotency_key)`; dedup semántico por `dedup_hash`.

## Necesidad medible que justifica la complejidad

Hoy: operaciones de 15 s – 6 min en HTTP abierto, 0 % de reanudación tras fallo, `auditar-todos` puede superar cualquier timeout. Meta: arranque de job p95 < 10 s, > 98 % de jobs completados sin intervención, 0 operaciones largas en HTTP abierto (criterio de terminación).

## Consecuencias

- Hay que escribir y testear el poller, el lock por lease, y el manejo de worker muerto (lease vencido → requeue).
- `pg_cron` y `pg_net` deben estar habilitados en el proyecto Supabase (extensiones estándar, sin costo).
- El worker corre en el límite de wall-clock de Edge Functions → los jobs se parten en steps (ver ADR 0002).
