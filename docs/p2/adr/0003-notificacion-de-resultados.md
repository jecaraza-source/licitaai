# ADR 0003 — Entrega de resultados y progreso al cliente

**Estado:** Propuesto · **Fecha:** 2026-08-26 · **Contexto de:** P2.1

## Decisión

**Realtime sobre `public.jobs` como canal primario, polling como fallback, email para jobs largos.**

1. `alter publication supabase_realtime add table public.jobs`. RLS ya filtra por org, así que un cliente solo ve sus jobs.
2. Componente `<JobStatus jobId>` se suscribe a `postgres_changes` de esa fila; muestra `progreso`/`progreso_detalle`/estado; al llegar a `COMPLETED` hace un `GET /api/jobs/:id` para traer el `result_ref` resuelto.
3. **Fallback de polling**: si la conexión Realtime no se establece en 3 s o se cae, `<JobStatus>` hace `GET /api/jobs/:id` con backoff 2 s → 10 s. (Cubre el requisito "si Realtime falla, permitir polling controlado".)
4. **Email** (Resend, ya integrado): al `COMPLETED`/`FAILED` de jobs cuyo `created_at` → `finished_at` > 60 s, o si el solicitante ya no tiene sesión activa. Idempotente por `job_id` (no se manda dos veces aunque el worker reintente el paso de notificación).
5. La creación del job responde **inmediato** con `202 { job_id }` (o `200 { data }` si el long-poll corto de compatibilidad alcanzó a resolverlo en < 8 s).

## Alternativas descartadas

- **SSE / streaming desde la ruta**: mantiene una conexión abierta = el problema que estamos quitando.
- **Web Push / notificaciones del navegador**: capacidad nueva, permiso del usuario, poco valor sobre email + Realtime.
- **Polling puro (sin Realtime)**: funciona pero peor UX y más carga; Realtime ya está en el stack y en uso para `documentos`.

## Consecuencias

- `public.jobs` en la publicación de Realtime aumenta el tráfico de Realtime proporcional a jobs activos (decenas, no miles) — aceptable.
- Hay que evitar `UPDATE` de `jobs` en cada micro-progreso (haría ruido en Realtime): el handler actualiza `progreso` en checkpoints con salto ≥ 5 %.
