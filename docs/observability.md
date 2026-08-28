# Observabilidad (P1.7)

## Logging estructurado

Cada request que pasa por `apiRoute()` emite **una** línea JSON (`[req] {...}`), tanto en éxito como en error:

```json
{
  "nivel": "info|warn|error",
  "request_id": "uuid",
  "method": "POST",
  "path": "/api/licitaciones/…",
  "status": 200,
  "duracion_ms": 143,
  "organization_id": "…",
  "user": "u_abcdef12",
  "error_code": "VALIDATION_ERROR"
}
```

- `nivel` se deriva del status: `≥500 → error`, `≥400 → warn`, resto `info`.
- `user` es **siempre** un prefijo anonimizado (`u_` + 8 hex del id) — nunca el id completo, el email ni la IP.
- `error_code` es el código estable de `ApiError` (no el mensaje).
- El `request_id` es el mismo que va en `meta.request_id` de la respuesta y en el tag de Sentry — un solo hilo para correlacionar respuesta ↔ log ↔ evento de Sentry.

Antes de P1.7 solo se logueaba en error (`logApiError`) o cuando la request era lenta (`[api:slow]`). Ahora hay una línea por request; `logApiError` se mantiene para el detalle del error server-side.

### Uso de IA

`EventoRequest.ia` (proveedor, modelo, tokens in/out, costo estimado, reintentos) está definido en `src/lib/observabilidad.ts` para las rutas que llaman a un modelo. La contabilidad de tokens/costo ya la lleva `ai_usage_log` / `ai_budget_ledger` (P0.6 / P2·C); el campo `ia` del log estructurado es para correlación en tiempo real, no para facturación.

### Qué nunca se registra

`src/lib/observabilidad.ts` · `redactar()` sustituye por `[redactado]` cualquier clave que matchee:

```
pass(word)? · contrase · secret · token · api_key · private_key ·
service_role · authorization · cookie · jwt · cer · key_base64 · firma_base64
```

Nunca a ningún canal: contraseñas, llaves privadas, JWT, `service_role`, documentos completos, prompts con contenido sensible, RFC completo, correos completos (solo el dominio, vía `dominioDeEmail()`).

## Sentry

`src/instrumentation.ts` (servidor + Edge) y `src/instrumentation-client.ts` (navegador):

| Ajuste | Valor | Por qué |
|---|---|---|
| `dsn` | `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | sin la variable, Sentry queda inerte (no falla el build) |
| `sendDefaultPii` | `false` | **nuevo** — no manda IP, cookies ni headers por defecto |
| `environment` | `VERCEL_ENV ?? NODE_ENV` | separa producción / preview / staging |
| `tracesSampleRate` | `0.1` | 10 % de trazas de rendimiento |
| `beforeSend` | `sentryBeforeSend` | **nuevo** — scrubber |

`sentryBeforeSend()`:
- borra `request.cookies` y `request.headers` del evento,
- redacta `request.data`, `extra` y `contexts` con `redactar()`,
- reduce `user` a `{ id: "u_abcdef12" }` (sin email, sin IP),
- recorta `query_string` larga.

El tag de organización que se añade en captura manual es solo el `organization_id` (un UUID, no PII) — permite agrupar incidentes por cliente sin identificar personas.

### Captura server / Edge / cliente

- **Server + Edge**: `register()` en `instrumentation.ts` + `onRequestError = Sentry.captureRequestError` (Next 16 lo llama en cualquier error de request no manejado).
- **Cliente**: `instrumentation-client.ts` + `onRouterTransitionStart`.
- **Errores de UI**: `src/app/global-error.tsx` ya reporta a Sentry.

### Alertas de fallos críticos

`GET /api/cron/monitoreo` (Vercel Cron, cada 10 min, P2·I) clasifica y manda a Sentry (`captureMessage` con nivel `fatal`/`error`/`warning`) + webhook opcional (`ALERTAS_WEBHOOK_URL`):

| Señal | Severidad |
|---|---|
| DLQ de jobs creciendo | SEV2 |
| Tasa de fallo de jobs > umbral (1 h) | SEV1/SEV2 |
| Jobs atascados sin arrancar | SEV2 |
| Circuit breaker de un proveedor abierto | SEV2 |

Los umbrales y el detalle de severidades están en `docs/p2/10-slo-y-alertas.md`.

## Pendiente

- Emitir el `logRequest` también desde las Edge Functions (hoy `_shared/auth.ts` loguea eventos de seguridad; falta la línea estructurada por invocación con el mismo formato).
- Panel de logs: hoy van a stdout (capturado por Vercel). Un destino consultable (Logtail / BetterStack / Sentry logs) queda para cuando haya volumen real.
- Rellenar `EventoRequest.ia` en las rutas de IA (el tipo está; falta pasarlo desde cada handler).

Tests: `tests/unit/observabilidad.test.mjs` (12 casos).
