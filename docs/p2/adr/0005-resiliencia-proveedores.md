# ADR 0005 — Resiliencia ante fallos de proveedores externos

**Estado:** Propuesto · **Fecha:** 2026-08-26 · **Contexto de:** P2.5

## Decisión

1. **Clasificación de errores** en `_shared/retry.ts` (y su gemelo Node):
   - Reintentable: `429`, `500`, `502`, `503`, `529`, timeouts de red, `ECONNRESET`.
   - No reintentable: `400`, `401`, `403`, `404`, `422`, errores de validación de esquema.
2. **Backoff exponencial con jitter**: `delay = base * 2^intento * (0.5 + Math.random()*0.5)`, tope 60 s. (Hoy `withRetry` no tiene jitter → tormenta de reintentos sincronizados.)
3. **Circuit breaker por proveedor** (`provider_health`: `provider, estado, fallos_consecutivos, abierto_hasta`):
   - `CLOSED` → normal. `>= 5` fallos consecutivos → `OPEN` por 60 s. Tras `OPEN` → `HALF_OPEN` (deja pasar 1) → `CLOSED` si OK, `OPEN` si falla.
   - Con el breaker `OPEN`, el worker deja el job en `RETRYING` con `next_attempt_at = abierto_hasta` en vez de quemar reintentos.
4. **Timeouts explícitos**: por llamada a proveedor (`AbortController`, p. ej. 120 s) y `lease_expires_at` por step (worker muerto → requeue).
5. **Fallbacks concretos** (requisito textual del brief):

| Fallo | Comportamiento |
|---|---|
| Anthropic caído | Job **nunca** pasa a COMPLETED; `documentos.procesado` no se toca; `RETRYING` → `FAILED` tras política; el usuario ve "no se pudo procesar, reintenta" |
| OpenAI embeddings caído | Step `extraer-texto` ya está COMPLETED con `result_ref` parcial; el job reanuda en el step `embeddings`; nada se pierde |
| Resend caído | Invitaciones/jobs idempotentes (`unique` sobre token / `idempotency_key`); reintentar no duplica; el envío de correo es su propio step reintentable |
| Realtime caído | Front hace polling (ADR 0003) |
| Sentry caído | `captureException` en try/catch; nunca bloquea |
| Generación interrumpida | Último step COMPLETED deja progreso verificable; no hay "resultado a medias" declarado como final |

6. **Degradación funcional**: si el breaker de IA está `OPEN`, la UI deshabilita el botón de la operación con un aviso ("servicio de IA no disponible, reintenta en unos minutos") en vez de encolar jobs que van a fallar.

## Consecuencias

- `provider_health` es estado compartido en DB → una lectura por llamada (barata, cacheable 5 s en el worker).
- Hay que decidir umbrales (5 fallos / 60 s) y ajustarlos con datos reales.
- Los tests de aceptación simulan caída de cada proveedor (mock que devuelve 529 / timeout).
