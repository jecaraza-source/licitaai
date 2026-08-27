# Runbooks — P2

Procedimientos de mitigación para los incidentes previstos. Cada runbook:
**síntoma → diagnóstico → mitigación → verificación → seguimiento**.

| Runbook | Sev típica | Disparador |
|---|---|---|
| [proveedor-ia-caido](proveedor-ia-caido.md) | SEV2 | circuit breaker `OPEN`; muchos jobs de IA en `RETRYING` |
| [dlq-creciendo](dlq-creciendo.md) | SEV2 | `jobs_dead_letter` ≥ 20/h |
| [worker-no-procesa](worker-no-procesa.md) | SEV1 | jobs `AUTHORIZED` que no arrancan; sin `started_at` reciente |
| [consumo-anormal-ia](consumo-anormal-ia.md) | SEV2/3 | pico de gasto en `ai_budget_ledger`; org sobre cuota |
| [migracion-fallida](migracion-fallida.md) | SEV1/2 | `supabase db push` falla en staging/prod |
| [revocar-sesiones](revocar-sesiones.md) | SEV1 | credenciales comprometidas |
| [fuga-de-datos](fuga-de-datos.md) | SEV1 | acceso cross-organización; datos expuestos |
| [documento-malicioso](documento-malicioso.md) | SEV2 | archivo que rompe el procesamiento o intenta prompt injection |
| [borrar-organizacion](borrar-organizacion.md) | — | baja de cuenta / derecho al olvido (operación planificada) |
| [setup-staging](setup-staging.md) | — | poner en marcha staging + producción (secrets, ramas, protección) — se hace una vez |

**Antes de empezar cualquier runbook:** abre el issue de incidente
(plantilla `incidente`), mira `/admin/salud` y `/api/ready`.

Herramientas: `supabase` CLI (linkeado al proyecto), acceso a Vercel
(rollback + env vars), Sentry, SQL editor de Supabase Studio.
