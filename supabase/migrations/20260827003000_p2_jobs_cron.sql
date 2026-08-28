-- P2 · A3 — disparadores del worker de jobs (ADR 0001).
--
-- Estrategia de disparo (defensa en profundidad):
--   1. Vercel Cron -> GET /api/cron/job-worker cada 1 min  (PRIMARIO, portable
--      entre entornos, sin secretos del lado de Postgres — ver vercel.json)
--   2. pg_cron cada 10s -> net.http_post al worker  (OPCIONAL, baja latencia
--      de arranque; requiere configurar app_settings por entorno, abajo)
--   3. Database Webhook en INSERT on public.jobs  (OPCIONAL, arranque
--      inmediato de jobs interactivos; se configura en el dashboard)
--
-- Esta migración solo instala lo SEGURO en todos los entornos:
--   - extensiones pg_cron / pg_net
--   - barrido de expirados por pg_cron (SQL puro, sin HTTP ni secretos)
--   - app_settings + disparar_worker() listos, pero el schedule HTTP queda
--     COMENTADO: se activa manualmente por entorno tras cargar la config.
--
-- Rollback:
--   select cron.unschedule('p2-expirar-jobs');
--   select cron.unschedule('p2-job-worker-tick');  -- si se activó
--   drop function if exists public.disparar_worker();
--   drop table if exists public.app_settings;

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ============================================================================
-- Barrido de jobs expirados / zombies — SQL puro, seguro en cualquier entorno.
-- pg_cron admite intervalos en segundos; 1 minuto es suficiente para EXPIRED.
-- ============================================================================
select cron.schedule(
  'p2-expirar-jobs',
  '* * * * *',
  $$ select public.expirar_jobs(); $$
);

-- ============================================================================
-- Config por entorno para el disparo HTTP del worker (opcional).
-- Solo el service role / postgres la leen; nunca un cliente.
-- ============================================================================
create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;
-- Sin políticas: inaccesible para authenticated/anon. Solo service_role
-- (bypassa RLS) y las funciones SECURITY DEFINER de abajo.

comment on table public.app_settings is
  'Config de plataforma por entorno (P2). Cargar: insert into app_settings(key,value) values (''worker_url'', ''https://<ref>.supabase.co/functions/v1/job-worker''), (''worker_secret'', ''<JOB_WORKER_SECRET>''); NUNCA commitear los valores.';

-- disparar_worker() — hace un POST no bloqueante al worker con el secreto
-- de app_settings. No-op silencioso si la config no está cargada (así la
-- migración es segura aunque el schedule se active por error).
create or replace function public.disparar_worker()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_secret text;
begin
  select value into v_url from public.app_settings where key = 'worker_url';
  select value into v_secret from public.app_settings where key = 'worker_secret';
  if v_url is null or v_secret is null then
    return;  -- config no cargada en este entorno
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 5000
  );
end;
$$;

revoke all on function public.disparar_worker() from public;
grant execute on function public.disparar_worker() to service_role;

-- Helper de observabilidad/tests: ¿existe un job de pg_cron con ese nombre?
-- (el esquema `cron` no está expuesto vía PostgREST).
create or replace function public.cron_job_existe(p_jobname text)
returns boolean
language sql
security definer
set search_path = public, cron
as $$
  select exists (select 1 from cron.job where jobname = p_jobname);
$$;

revoke all on function public.cron_job_existe(text) from public;
grant execute on function public.cron_job_existe(text) to service_role;

-- ============================================================================
-- Schedule HTTP del worker cada 10s — DESACTIVADO por defecto.
-- Activar por entorno, DESPUÉS de cargar app_settings:
--
--   select cron.schedule('p2-job-worker-tick', '10 seconds',
--     $$ select public.disparar_worker(); $$);
--
-- Sin él, el worker sigue corriendo por Vercel Cron cada 1 min (suficiente
-- para el SLO de arranque < 10s en la mayoría de casos; el tick de 10s solo
-- lo mejora).
-- ============================================================================
