# Runbook — El worker no procesa jobs

**Sev:** SEV1 (si es total) / SEV2 (si es lento)

## Síntoma

Alerta: `jobs sin arrancar y sin actividad del worker > 5 min`. Jobs se
acumulan en `AUTHORIZED`; `/admin/salud` → "jobs atascados" > 0, "último
arranque" viejo.

## Diagnóstico

```sql
select estado, count(*) from public.jobs
 where estado in ('AUTHORIZED','RETRYING','RUNNING') group by 1;
select max(started_at) as ultimo_arranque from public.jobs;
select * from cron.job where jobname like 'p2-%';
```

Probar el worker a mano (debe responder 200 en ~1–2 s):

```bash
curl -s -X POST "$SUPABASE_URL/functions/v1/job-worker" \
  -H "Authorization: Bearer $JOB_WORKER_SECRET" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY"
```

Causas frecuentes:

1. **Vercel Cron dejó de disparar** — revisar Vercel → Cron logs.
   `CRON_SECRET` / `JOB_WORKER_SECRET` faltante o rotado → el worker
   responde 401.
2. **pg_cron / pg_net roto** — el tick de 10 s no llega (solo afecta la
   latencia; Vercel Cron de 1 min debería seguir).
3. **La Edge Function `job-worker` crashea** — ver logs en Supabase →
   Functions. Un handler que rebasa el wall-clock "Killed" (jobs poison de
   un tipo — ver [dlq-creciendo](dlq-creciendo.md)).
4. **Todos los jobs `RUNNING` con lease vencido** (workers muertos a mitad)
   — `expirar_jobs()` los debería liberar; ejecutarlo a mano:
   ```sql
   select public.expirar_jobs();
   ```

## Mitigación

- **Secret**: corregir en Vercel + `supabase secrets set JOB_WORKER_SECRET=...`,
  redeploy de la función. Verificar con el `curl` de arriba.
- **Función crasheando**: identificar el tipo de job que la mata
  (`docker logs` / Supabase Function logs), cancelar esos jobs
  (`update ... set estado='CANCELLED'`), bajar su flag `jobs.async_<tipo>`.
- **Disparador muerto**: mientras se arregla, disparar el worker
  manualmente en bucle:
  ```bash
  while true; do curl -s -X POST "$SUPABASE_URL/functions/v1/job-worker" \
    -H "Authorization: Bearer $JOB_WORKER_SECRET" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" >/dev/null; sleep 20; done
  ```

## Verificación

- `/admin/salud` → "jobs atascados" = 0, "último arranque" reciente,
  arranque p95 < 10 s.
- La cola (`AUTHORIZED` + `RETRYING`) baja de forma sostenida.

## Seguimiento

Si fue un secret rotado sin actualizar el worker: añadir el secret al
checklist de rotación. Si fue wall-clock: re-partir ese tipo de job en
steps (ver B1 / riesgo R1).
