# Runbook — Proveedor de IA caído (Anthropic / OpenAI)

**Sev:** SEV2

## Síntoma

- Alerta de monitoreo: `circuit breaker abierto: anthropic` (u `openai`).
- Muchos jobs de IA en `RETRYING`; usuarios reportan que "Analizar / Auditar
  no funciona" o el botón está deshabilitado.

## Diagnóstico

```sql
select * from public.provider_health;
select tipo, count(*) from public.jobs
 where estado = 'RETRYING' group by tipo order by 2 desc;
select error_seguro, count(*) from public.jobs
 where estado in ('RETRYING','FAILED') and finished_at > now() - interval '30 min'
 group by 1 order by 2 desc;
```

Confirmar con el status page del proveedor (status.anthropic.com /
status.openai.com).

## Mitigación

El sistema ya se auto-protege si el flag `resiliencia.circuit_breaker` está
activo: los jobs quedan en `RETRYING` con espera larga y **no consumen
presupuesto de reintentos**; los botones de IA se deshabilitan.

1. **Confirmar que el flag está activo** (si no lo estaba, activarlo):
   ```sql
   update public.feature_flags set enabled = true where key = 'resiliencia.circuit_breaker';
   ```
2. **Comunicar** — actualizar la página de estado: "El análisis con IA está
   temporalmente no disponible; se reanudará automáticamente."
3. **No** cancelar los jobs en `RETRYING` — se reanudan solos cuando el
   proveedor vuelve (el circuito pasa a `HALF_OPEN` → `CLOSED`).
4. Si el proveedor tiene un incidente largo (> 1 h) y hay jobs urgentes,
   evaluar (con producto) forzar `politica_modelo` a otro proveedor donde
   sea posible, o comunicar el retraso.

## Verificación

- Cuando el proveedor se recupera: `cb_estado('anthropic')` → `HALF_OPEN` →
  tras un job exitoso → `CLOSED` (o forzar):
  ```sql
  select public.cb_registrar_exito('anthropic');
  ```
- Los jobs `RETRYING` vuelven a `RUNNING` en el siguiente tick del worker.
- `/admin/salud` → circuit breakers todos `CLOSED`.

## Seguimiento

- Revisar `ai_budget_ledger`: ninguna reserva quedó colgada (todas
  `CONSUMIDO`/`LIBERADO`).
- Si el umbral (5 fallos) abrió el circuito por falsos positivos (p. ej.
  rate limits nuestros, no caída real), ajustar `CB_UMBRAL_FALLOS` /
  `CB_ABIERTO_SEGUNDOS`.
