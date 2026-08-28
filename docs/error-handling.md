# Manejo de errores (P1)

## Sobre de respuesta

Toda ruta bajo `src/app/api` que pasa por `apiRoute()` responde con:

```jsonc
// éxito
{ "data": { /* … */ }, "error": null, "meta": { "request_id": "uuid" } }

// error
{ "data": null,
  "error": { "code": "RESOURCE_NOT_FOUND", "message": "Mensaje seguro para el usuario", "details": { /* opcional */ } },
  "meta": { "request_id": "uuid" } }
```

- `code` es **estable** — el frontend decide con él (p. ej. mostrar el flujo de upgrade en `AI_BUDGET_EXCEEDED`) sin parsear el mensaje.
- `message` **siempre** es seguro de mostrar al usuario final. Nunca el mensaje crudo de Postgres/Supabase/un SDK de IA.
- `request_id` correlaciona la respuesta con el log `[req]` (P1.7) y el evento de Sentry.

## Catálogo (`src/lib/api/errors.ts`)

| `code` | HTTP | Cuándo |
|---|---|---|
| `UNAUTHENTICATED` | 401 | sin sesión válida |
| `FORBIDDEN` | 403 | sesión válida pero sin permiso (rol, perfil ausente) |
| `NOT_FOUND` | 404 | recurso inexistente **o de otra organización** (no se revela cuál) |
| `VALIDATION_ERROR` | 400 | Zod falló, o una regla de negocio de entrada (`details` lleva el detalle de campo) |
| `CONFLICT` | 409 | choque de estado (p. ej. el documento cambió entre firmar y guardar) |
| `UNPROCESSABLE_CONTENT` | 422 | entrada bien formada pero no procesable |
| `PAYLOAD_TOO_LARGE` | 413 | body sobre el límite antes de parsear |
| `RATE_LIMITED` | 429 | `check_rate_limit` |
| `AI_BUDGET_EXCEEDED` | 429 | tope diario de tokens de IA de la organización |
| `UPSTREAM_ERROR` | 502 | un proveedor externo no pudo procesar |
| `INTERNAL_ERROR` | 500 | cualquier `throw` no controlado — **el mensaje real nunca sale**, solo va al log server-side con el `request_id` |

## Reglas

1. **Un handler nunca deja escapar un error crudo.** Cualquier `throw` que no sea `ApiError` → `INTERNAL_ERROR` genérico; el detalle se registra con `logApiError()` + `request_id`.
2. **Un error de query no se confunde con "sin datos".** El patrón `const { data } = await supabase…` sin revisar `.error` era el hallazgo #4 de la auditoría; las rutas migradas revisan `error` y lanzan `ApiError.internal()` / `.notFound()` según corresponda.
3. **Cross-tenant → 404, nunca 403.** Un recurso de otra organización responde `NOT_FOUND` — no se revela que existe.
4. **`details` solo lleva datos seguros** (errores de campo de Zod, un `motivo` enumerado como `"rfc_distinto"`). Nunca un `error.message` crudo.
5. **Errores de auditoría (`actividad_log`)**: si el registro es crítico para la operación, va en la misma transacción (P1.2, RPC). Si es informativo, un fallo se registra en el log pero no tumba la operación principal.

## Frontend

Los consumidores leen `json.data` en éxito y `json.error?.message` (o `json.error?.code` para decisiones) en error. Patrón defensivo habitual: `json.error?.message ?? json.error`.

## Cambios incompatibles introducidos en P1

Documentados en `docs/api-contracts.md`:
- `GET /api/organizacion/staff`: `invitacionesPendientes` / `puedeInvitar` / lista movidos bajo `data.*`.
- `POST /api/documentos/[docId]/firmar`: caso "RFC distinto" → `VALIDATION_ERROR` con `error.details.motivo === "rfc_distinto"`.
- `POST /api/organizacion/staff/invitar`: ahora con rate limit + validación real de correo.
