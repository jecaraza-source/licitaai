-- P2 · I — métricas de operación para el dashboard de salud (P2.9).
--
-- Devuelve un blob jsonb con las señales de salud del sistema de jobs, los
-- circuit breakers y el consumo de IA. Solo service_role (la ruta
-- /api/admin/salud verifica antes que el llamante sea platform admin).
--
-- Rollback: drop function if exists public.metricas_operacion();

create or replace function public.metricas_operacion()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  with j24 as (
    select * from public.jobs where created_at >= now() - interval '24 hours'
  ),
  arranque as (
    select extract(epoch from (started_at - created_at)) as seg
    from j24 where started_at is not null
  ),
  terminados as (
    select estado from j24 where estado in ('COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED')
  ),
  gasto_mes as (
    select
      organization_id,
      sum(case when estado in ('RESERVADO', 'CONSUMIDO') then monto_usd else -monto_usd end) as usd
    from public.ai_budget_ledger
    where created_at >= date_trunc('month', now())
    group by organization_id
  )
  select jsonb_build_object(
    'generado_at', now(),
    'jobs', jsonb_build_object(
      'por_estado', (
        select coalesce(jsonb_object_agg(estado, n), '{}'::jsonb)
        from (select estado, count(*) n from public.jobs
              where estado in ('PENDING','AUTHORIZED','RUNNING','RETRYING')
              group by estado) s
      ),
      'ultimas_24h', jsonb_build_object(
        'total', (select count(*) from j24),
        'completados', (select count(*) from j24 where estado = 'COMPLETED'),
        'fallidos', (select count(*) from j24 where estado = 'FAILED'),
        'cancelados', (select count(*) from j24 where estado = 'CANCELLED'),
        'expirados', (select count(*) from j24 where estado = 'EXPIRED')
      ),
      'sin_intervencion_pct', (
        select case when count(*) = 0 then null
               else round(100.0 * count(*) filter (where estado = 'COMPLETED') / count(*), 1) end
        from terminados
      ),
      'arranque_seg', jsonb_build_object(
        'p50', (select round(percentile_cont(0.5) within group (order by seg)::numeric, 2) from arranque),
        'p95', (select round(percentile_cont(0.95) within group (order by seg)::numeric, 2) from arranque),
        'max', (select round(max(seg)::numeric, 2) from arranque)
      ),
      'dead_letter', jsonb_build_object(
        'ultima_hora', (select count(*) from public.jobs_dead_letter where created_at >= now() - interval '1 hour'),
        'ultimas_24h', (select count(*) from public.jobs_dead_letter where created_at >= now() - interval '24 hours')
      ),
      'atascados', (
        select count(*) from public.jobs
        where estado = 'AUTHORIZED' and created_at < now() - interval '5 minutes'
      ),
      'ultimo_arranque_at', (select max(started_at) from public.jobs)
    ),
    'circuit_breakers', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'provider', provider, 'estado', estado,
        'fallos_consecutivos', fallos_consecutivos,
        'abierto_hasta', abierto_hasta, 'ultimo_fallo_at', ultimo_fallo_at
      ) order by provider), '[]'::jsonb)
      from public.provider_health
    ),
    'consumo_ia', jsonb_build_object(
      'orgs_con_gasto', (select count(*) from gasto_mes where usd > 0),
      'gasto_total_mes_usd', (select coalesce(round(sum(greatest(usd, 0))::numeric, 2), 0) from gasto_mes),
      'top_orgs', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'organization_id', g.organization_id,
          'nombre', o.nombre,
          'gasto_usd', round(g.usd::numeric, 2),
          'cuota_usd', p.cuota_mensual_usd,
          'pct_cuota', case when p.cuota_mensual_usd > 0
                            then round(100.0 * g.usd / p.cuota_mensual_usd, 0) else null end
        ) order by g.usd desc), '[]'::jsonb)
        from (select * from gasto_mes order by usd desc limit 10) g
        join public.organizations o on o.id = g.organization_id
        left join public.ai_org_policy p on p.organization_id = g.organization_id
      ),
      'orgs_sobre_80pct', (
        select count(*) from gasto_mes g
        left join public.ai_org_policy p on p.organization_id = g.organization_id
        where p.cuota_mensual_usd > 0 and g.usd >= 0.8 * p.cuota_mensual_usd
      )
    ),
    'flags_activos', (
      select coalesce(jsonb_agg(key order by key), '[]'::jsonb)
      from public.feature_flags where enabled = true or rollout_pct > 0
    )
  );
$$;

revoke all on function public.metricas_operacion() from public;
grant execute on function public.metricas_operacion() to service_role;
