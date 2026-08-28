-- P2 punch-list B1 + B2 — concurrencia por organización y fairness del worker.
--
-- B1 (C6): `reclamar_jobs` ignoraba `ai_org_policy.max_concurrent_jobs`
--          (R13) — una organización con muchos jobs acaparaba el worker.
-- B2:      la selección era FIFO global. Ahora es round-robin por
--          organización: el job de mayor prioridad de CADA org antes de
--          pasar al segundo de cualquiera.
--
-- Reglas:
--   - Solo se arrancan jobs frescos (AUTHORIZED/RETRYING) hasta llenar el
--     cupo de la org: `max_concurrent_jobs - (jobs RUNNING con lease vivo)`.
--   - Un job RUNNING con lease vencido (worker muerto) se retoma SIEMPRE,
--     sin contra el cupo — es recuperación, no un arranque nuevo.
--   - `max_concurrent_jobs` es configurable por org (columna ya existente,
--     default 3). Una org sin fila en `ai_org_policy` usa el default.
--
-- Rollback: restaurar la versión de reclamar_jobs de
--   20260827001000_p2_jobs.sql y la de metricas_operacion de
--   20260830000000_p2_i_metricas_operacion.sql.

create or replace function public.reclamar_jobs(
  p_worker_id text,
  p_limite int default 5
) returns setof public.jobs
language sql
security definer
set search_path = public
as $$
  with corriendo as (
    -- jobs realmente en vuelo por organización (lease vivo)
    select organization_id, count(*)::int as n
      from public.jobs
     where estado = 'RUNNING' and lease_expires_at > now()
     group by organization_id
  ),
  elegibles as (
    select
      j.id,
      j.organization_id,
      j.prioridad,
      j.created_at,
      (j.estado = 'RUNNING') as es_reclamo_stale,
      row_number() over (
        partition by j.organization_id
        order by (j.estado = 'RUNNING') desc, j.prioridad asc, j.created_at asc
      ) as rango_org
    from public.jobs j
    where j.expires_at > now()
      and (
        (j.estado in ('AUTHORIZED', 'RETRYING')
          and (j.next_attempt_at is null or j.next_attempt_at <= now()))
        or (j.estado = 'RUNNING' and j.lease_expires_at < now())
      )
  ),
  con_cupo as (
    select e.*
      from elegibles e
      left join corriendo c on c.organization_id = e.organization_id
      left join public.ai_org_policy p on p.organization_id = e.organization_id
     where e.es_reclamo_stale
        or e.rango_org <= greatest(
             0,
             coalesce(p.max_concurrent_jobs, 3) - coalesce(c.n, 0)
           )
  ),
  seleccion as (
    -- round-robin: rango 1 de todas las orgs, luego rango 2, …
    select id
      from con_cupo
     order by rango_org asc, prioridad asc, created_at asc
     limit greatest(1, coalesce(p_limite, 5))
  )
  update public.jobs j
     set estado = 'RUNNING',
         intentos = j.intentos + 1,
         started_at = coalesce(j.started_at, now()),
         lease_expires_at = now() + interval '5 minutes',
         worker_id = p_worker_id
   where j.id in (
     select id from public.jobs
      where id in (select id from seleccion)
      for update skip locked
   )
  returning j.*;
$$;

revoke all on function public.reclamar_jobs(text, int) from public;
revoke all on function public.reclamar_jobs(text, int) from anon;
revoke all on function public.reclamar_jobs(text, int) from authenticated;
grant execute on function public.reclamar_jobs(text, int) to service_role;

-- ── B2 — latencia de arranque p95 por organización en /admin/salud ──────
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
  arranque_org as (
    select
      organization_id,
      count(*) as n,
      round(percentile_cont(0.95) within group (order by extract(epoch from (started_at - created_at)))::numeric, 2) as p95_seg
    from j24
    where started_at is not null
    group by organization_id
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
      'arranque_seg_por_org', (
        -- Las 10 orgs con peor p95 de arranque (24 h) — para detectar si el
        -- cupo por organización (B1) está causando espera desigual (R13).
        select coalesce(jsonb_agg(jsonb_build_object(
          'organization_id', a.organization_id,
          'nombre', o.nombre,
          'jobs', a.n,
          'p95_seg', a.p95_seg,
          'max_concurrent_jobs', coalesce(p.max_concurrent_jobs, 3)
        ) order by a.p95_seg desc nulls last), '[]'::jsonb)
        from (select * from arranque_org order by p95_seg desc nulls last limit 10) a
        join public.organizations o on o.id = a.organization_id
        left join public.ai_org_policy p on p.organization_id = a.organization_id
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
revoke all on function public.metricas_operacion() from anon;
revoke all on function public.metricas_operacion() from authenticated;
grant execute on function public.metricas_operacion() to service_role;
