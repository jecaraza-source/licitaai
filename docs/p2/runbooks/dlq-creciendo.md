# Runbook — Dead letter queue creciendo

**Sev:** SEV2

## Síntoma

Alerta: `dead letter: N en la última hora` (N ≥ 20). `/admin/salud` muestra
DLQ alto.

## Diagnóstico

```sql
select tipo, motivo, error_seguro, count(*), max(created_at)
from public.jobs_dead_letter
where created_at > now() - interval '2 hours'
group by 1,2,3 order by 4 desc;
```

- **Un solo `tipo` + mismo `error_seguro`** → bug en un handler / EF, o un
  cambio de contrato del proveedor. Ver también los `error_interno_ref` en
  `public.jobs` (los ids de Sentry).
- **Varios tipos, mismo error de credencial** → secret faltante/rotado
  (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`).
- **`motivo = 'error_no_reintentable'` con validación de esquema** → el
  modelo cambió su salida; revisar el `prompt_template` y el JSON Schema.

## Mitigación

1. **Frenar la fuente** si es un tipo concreto: bajar su flag
   `jobs.async_<tipo>` → las nuevas peticiones vuelven al modo síncrono (o
   se rechazan si la EF también falla). Los jobs ya encolados de ese tipo:
   ```sql
   update public.jobs set estado = 'CANCELLED', finished_at = now()
   where tipo = '<tipo>' and estado in ('AUTHORIZED','RETRYING');
   ```
2. Si es un secret: corregirlo en Vercel + `supabase secrets set` y
   redeploy de las Edge Functions.
3. Si es un bug del handler: revert del deploy (`git revert` + pipeline, o
   Vercel/Supabase rollback).

## Re-procesar los jobs de la DLQ (tras arreglar la causa)

```sql
-- Recrear como jobs nuevos a partir de la DLQ (revisar antes que la causa
-- esté resuelta; no re-encolar en masa a ciegas).
insert into public.jobs (organization_id, requested_by, tipo, recurso_tipo, recurso_id, input_json, estado, authorized_at)
select dl.organization_id, null, dl.tipo, dl.recurso_tipo, dl.recurso_id, dl.input_json, 'AUTHORIZED', now()
from public.jobs_dead_letter dl
where dl.id = any('{<ids>}'::uuid[]);
```

## Verificación

- `/admin/salud` → DLQ (1h) vuelve a 0.
- Tasa de fallo de jobs 24h < 2 % (`jobs.sin_intervencion_pct` ≥ 98).

## Seguimiento

Postmortem si fue SEV2. Considerar una eval (`tests/evals/`) que cubra el
caso que rompió, si fue un cambio de salida del modelo.
