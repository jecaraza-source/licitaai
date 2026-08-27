# Runbook — Consumo anormal de IA

**Sev:** SEV2 (pico agudo) / SEV3 (org sobre cuota)

## Síntoma

Alerta: `N organización(es) sobre el 80 % de su cuota mensual`. O un pico
inesperado de gasto en `/admin/salud` → "Consumo de IA".

## Diagnóstico

```sql
-- gasto por organización este mes
select o.nombre, g.usd, p.cuota_mensual_usd,
       round(100.0*g.usd/nullif(p.cuota_mensual_usd,0)) as pct
from (
  select organization_id,
    sum(case when estado in ('RESERVADO','CONSUMIDO') then monto_usd else -monto_usd end) usd
  from public.ai_budget_ledger where created_at >= date_trunc('month', now())
  group by 1
) g
join public.organizations o on o.id = g.organization_id
left join public.ai_org_policy p on p.organization_id = g.organization_id
order by g.usd desc;

-- qué operaciones/usuarios generan el gasto
select j.tipo, count(*), sum(j.costo_real_usd) usd, count(distinct j.requested_by) usuarios
from public.jobs j
where j.organization_id = '<org>' and j.created_at >= now() - interval '24 hours'
group by 1 order by usd desc;
```

Distinguir:

- **Uso legítimo alto** (la org realmente está trabajando mucho) → subir la
  cuota con producto/comercial; el sistema ya frenó el exceso con 429.
- **Bucle / abuso** (un mismo recurso re-analizado cientos de veces, un
  usuario disparando en loop) → el `dedup_hash` y la idempotencia deberían
  frenarlo; si no, hay un bug en el frontend.
- **Estimación mala** (reservas muy por encima del real) → error de
  calibración; ver `costo_estimado_usd` vs `costo_real_usd` en `jobs`.

## Mitigación

1. El tope ya actúa: `reservar_presupuesto_ia` rechaza con 429
   (`AI_BUDGET_EXCEEDED`) al superar la cuota; los jobs no se crean.
2. Si es un bucle de una org concreta y hay que cortar YA:
   ```sql
   update public.ai_org_policy set limite_diario_usd = 0.01
   where organization_id = '<org>';  -- revertir tras investigar
   ```
   o bajar su `max_concurrent_jobs`.
3. Si es un usuario: revocar su sesión ([revocar-sesiones](revocar-sesiones.md)).
4. Ajustar cuota real con comercial si el uso es legítimo:
   ```sql
   update public.ai_org_policy set cuota_mensual_usd = <nueva>
   where organization_id = '<org>';
   ```

## Verificación

`/admin/salud` → gasto de la org se estabiliza; ninguna reserva colgada
(`ai_budget_ledger` sin `RESERVADO` viejos sin `CONSUMIDO`/`LIBERADO`).

## Seguimiento

- Si fue error de estimación: recalibrar los factores de
  `src/lib/ai-estimate.ts` con la muestra de `estimado` vs `real`.
- Si fue un bucle del frontend: bug + test de regresión.
