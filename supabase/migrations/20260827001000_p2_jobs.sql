-- P2 · A1 — Sistema de jobs asíncronos (ADR 0001, ADR 0002).
--
-- Saca las operaciones largas (OCR, embeddings, análisis IA, auditorías,
-- generación de propuestas) de la petición HTTP. La tabla public.jobs es
-- la ÚNICA fuente de verdad (estado, progreso, costo, resultado). El
-- worker (Edge Function job-worker, incremento A2) drena la cola con
-- SELECT ... FOR UPDATE SKIP LOCKED vía reclamar_jobs().
--
-- Este incremento entrega solo el esquema + las funciones de transición de
-- estado + RLS + tests. Nada la usa todavía (ninguna operación migrada).
--
-- Rollback:
--   drop function if exists public.crear_job(text,text,uuid,jsonb,text,smallint,text,smallint,interval);
--   drop function if exists public.cancelar_job(uuid);
--   drop function if exists public.reclamar_jobs(text,int);
--   drop function if exists public.progreso_job(uuid,smallint,text);
--   drop function if exists public.completar_job(uuid,jsonb,text,text,integer,integer,numeric);
--   drop function if exists public.fallar_job(uuid,text,text,boolean);
--   drop function if exists public.reencolar_step_job(uuid,text,jsonb,smallint);
--   drop function if exists public.expirar_jobs();
--   drop function if exists public.job_recurso_pertenece(text,uuid,uuid);
--   drop table if exists public.jobs_dead_letter cascade;
--   drop table if exists public.jobs cascade;

-- ============================================================================
-- TABLA jobs
-- ============================================================================
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  requested_by uuid references public.users (id) on delete set null,

  tipo text not null check (tipo in (
    'noop',
    'procesar-documento', 'analizar-bases', 'generar-estudio-mercado',
    'generar-preguntas-junta', 'generar-propuesta-tecnica',
    'auditar-documento', 'auditar-expediente', 'seguimiento-analizar-fallo',
    'analizar-documento-corporativo', 'procesar-referencia-legal'
  )),
  recurso_tipo text check (recurso_tipo in (
    'licitacion', 'documento', 'documento_corporativo',
    'checklist_item', 'referencia_legal', 'organizacion'
  )),
  recurso_id uuid,

  estado text not null default 'PENDING' check (estado in (
    'PENDING', 'AUTHORIZED', 'RUNNING', 'RETRYING',
    'COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED'
  )),
  prioridad smallint not null default 100,           -- menor = antes
  progreso smallint not null default 0 check (progreso between 0 and 100),
  progreso_detalle text,
  step_actual text,

  intentos smallint not null default 0,
  max_intentos smallint not null default 3,
  next_attempt_at timestamptz,                       -- backoff de RETRYING
  cancel_solicitada boolean not null default false,  -- cancelación cooperativa
  worker_id text,
  lease_expires_at timestamptz,                      -- lock del worker

  idempotency_key text,
  dedup_hash text,                                   -- reutilización semántica
  input_json jsonb not null default '{}'::jsonb,

  provider text,
  modelo text,
  tokens_estimados integer,
  tokens_input integer,
  tokens_output integer,
  costo_estimado_usd numeric(10, 5),
  costo_real_usd numeric(10, 5),
  reserva_id uuid,                                   -- ai_budget_ledger (P2.2)

  result_ref jsonb,                                  -- { tabla, id } o resultado inline
  reused_from uuid references public.jobs (id) on delete set null,
  error_seguro text,                                 -- apto para el cliente
  error_interno_ref text,                            -- request_id / Sentry id

  created_at timestamptz not null default now(),
  authorized_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  updated_at timestamptz not null default now()
);

comment on table public.jobs is
  'Cola + estado de operaciones asíncronas (P2.1, ADR 0001). Fuente de verdad única. Sin INSERT/UPDATE/DELETE directo: todo pasa por crear_job/cancelar_job (authenticated) o las funciones del worker (service_role).';

-- Índice de la cola: exactamente el orden de reclamar_jobs().
create index jobs_cola_idx on public.jobs (prioridad, created_at)
  where estado in ('AUTHORIZED', 'RETRYING');
create index jobs_org_created_idx on public.jobs (organization_id, created_at desc);
create index jobs_recurso_idx on public.jobs (recurso_tipo, recurso_id);
create index jobs_lease_idx on public.jobs (lease_expires_at) where estado = 'RUNNING';
create index jobs_dedup_idx on public.jobs (organization_id, dedup_hash) where dedup_hash is not null;
create unique index jobs_idempotency_uk on public.jobs (organization_id, idempotency_key)
  where idempotency_key is not null;

create trigger jobs_set_updated_at
  before update on public.jobs
  for each row execute function public.set_updated_at();

alter table public.jobs enable row level security;

-- Lectura para miembros de la organización. Sin políticas de escritura a
-- propósito (mismo patrón que ai_usage_log).
create policy jobs_select_own_org on public.jobs
  for select using (organization_id = public.user_org_id());

-- ============================================================================
-- TABLA jobs_dead_letter
-- ============================================================================
create table public.jobs_dead_letter (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  tipo text not null,
  recurso_tipo text,
  recurso_id uuid,
  input_json jsonb,
  intentos smallint,
  error_seguro text,
  error_interno_ref text,
  motivo text not null default 'max_intentos',
  created_at timestamptz not null default now()
);

create index jobs_dead_letter_org_idx on public.jobs_dead_letter (organization_id, created_at desc);

alter table public.jobs_dead_letter enable row level security;

create policy jobs_dead_letter_select_own_org on public.jobs_dead_letter
  for select using (organization_id = public.user_org_id());

-- ============================================================================
-- HELPER: ¿el recurso pertenece a la organización?
-- ============================================================================
create or replace function public.job_recurso_pertenece(
  p_recurso_tipo text,
  p_recurso_id uuid,
  p_org uuid
) returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if p_recurso_tipo is null or p_recurso_id is null then
    return false;
  end if;

  return case p_recurso_tipo
    when 'organizacion' then p_recurso_id = p_org
    when 'licitacion' then exists (
      select 1 from public.licitaciones where id = p_recurso_id and organization_id = p_org)
    when 'documento' then exists (
      select 1 from public.documentos d
      join public.licitaciones l on l.id = d.licitacion_id
      where d.id = p_recurso_id and l.organization_id = p_org)
    when 'checklist_item' then exists (
      select 1 from public.checklist_items c
      join public.licitaciones l on l.id = c.licitacion_id
      where c.id = p_recurso_id and l.organization_id = p_org)
    when 'documento_corporativo' then exists (
      select 1 from public.documentos_corporativos dc
      join public.empresa_perfil ep on ep.id = dc.empresa_perfil_id
      where dc.id = p_recurso_id and ep.organization_id = p_org)
    -- referencias_legales es un catálogo GLOBAL (sin organization_id):
    -- cualquier organización puede encolar su procesamiento. Solo se
    -- verifica que la referencia exista.
    when 'referencia_legal' then exists (
      select 1 from public.referencias_legales where id = p_recurso_id)
    else false
  end;
end;
$$;

-- ============================================================================
-- crear_job — llamada por authenticated (rutas /api/jobs, incremento A4)
-- ============================================================================
create or replace function public.crear_job(
  p_tipo text,
  p_recurso_tipo text default null,
  p_recurso_id uuid default null,
  p_input jsonb default '{}'::jsonb,
  p_idempotency_key text default null,
  p_prioridad smallint default 100,
  p_dedup_hash text default null,
  p_max_intentos smallint default 3,
  p_expires_in interval default interval '24 hours'
) returns public.jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_job public.jobs;
begin
  if auth.uid() is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;

  v_org := public.user_org_id();
  if v_org is null then
    raise exception 'Perfil sin organización' using errcode = '42501';
  end if;

  -- Idempotencia: si ya existe un job con esta (org, idempotency_key),
  -- devolver ese — nunca crear uno nuevo (previene doble encolado por
  -- reintento de red del cliente).
  if p_idempotency_key is not null then
    select * into v_job from public.jobs
     where organization_id = v_org and idempotency_key = p_idempotency_key;
    if found then
      return v_job;
    end if;
  end if;

  -- Autorización del recurso: debe pertenecer a la organización del
  -- llamante. Un recurso ajeno se comporta como inexistente.
  if p_recurso_tipo is not null then
    if not public.job_recurso_pertenece(p_recurso_tipo, p_recurso_id, v_org) then
      raise exception 'Recurso no encontrado' using errcode = 'P0002';
    end if;
  end if;

  -- P2.2 (incremento C2) insertará aquí, tras el flag ai.gobierno_costo, el
  -- paso PENDING -> estimación -> reserva de presupuesto -> AUTHORIZED. Sin
  -- gobierno de costo todavía, el job pasa directo a AUTHORIZED.
  insert into public.jobs (
    organization_id, requested_by, tipo, recurso_tipo, recurso_id,
    estado, prioridad, intentos, max_intentos, idempotency_key, dedup_hash,
    input_json, authorized_at, expires_at
  ) values (
    v_org, auth.uid(), p_tipo, p_recurso_tipo, p_recurso_id,
    'AUTHORIZED', coalesce(p_prioridad, 100), 0, coalesce(p_max_intentos, 3),
    p_idempotency_key, p_dedup_hash,
    coalesce(p_input, '{}'::jsonb), now(), now() + coalesce(p_expires_in, interval '24 hours')
  )
  returning * into v_job;

  return v_job;
end;
$$;

-- ============================================================================
-- cancelar_job — llamada por authenticated
-- ============================================================================
create or replace function public.cancelar_job(p_job_id uuid)
returns public.jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.jobs;
begin
  if auth.uid() is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;

  select * into v_job from public.jobs
   where id = p_job_id and organization_id = public.user_org_id()
   for update;

  if not found then
    raise exception 'Job no encontrado' using errcode = 'P0002';
  end if;

  if v_job.estado in ('PENDING', 'AUTHORIZED', 'RETRYING') then
    update public.jobs
       set estado = 'CANCELLED', finished_at = now(), lease_expires_at = null
     where id = p_job_id
     returning * into v_job;
  elsif v_job.estado = 'RUNNING' then
    -- Cancelación cooperativa: el worker lo verá en el siguiente checkpoint.
    update public.jobs set cancel_solicitada = true where id = p_job_id
     returning * into v_job;
  end if;
  -- Estados terminales: no-op, se devuelve tal cual.

  return v_job;
end;
$$;

-- ============================================================================
-- FUNCIONES DEL WORKER (service_role)
-- ============================================================================

-- reclamar_jobs — SELECT ... FOR UPDATE SKIP LOCKED: previene procesamiento
-- duplicado sin cola externa. Retoma también jobs RUNNING con lease vencido
-- (worker muerto), contando el retomo como un intento.
create or replace function public.reclamar_jobs(
  p_worker_id text,
  p_limite int default 5
) returns setof public.jobs
language sql
security definer
set search_path = public
as $$
  update public.jobs j
     set estado = 'RUNNING',
         intentos = j.intentos + 1,
         started_at = coalesce(j.started_at, now()),
         lease_expires_at = now() + interval '5 minutes',
         worker_id = p_worker_id
   where j.id in (
     select id from public.jobs
      where expires_at > now()
        and (
          (estado in ('AUTHORIZED', 'RETRYING')
            and (next_attempt_at is null or next_attempt_at <= now()))
          or (estado = 'RUNNING' and lease_expires_at < now())
        )
      order by prioridad asc, created_at asc
      for update skip locked
      limit greatest(1, coalesce(p_limite, 5))
   )
  returning j.*;
$$;

create or replace function public.progreso_job(
  p_job_id uuid,
  p_progreso smallint,
  p_detalle text default null
) returns void
language sql
security definer
set search_path = public
as $$
  update public.jobs
     set progreso = greatest(progreso, coalesce(p_progreso, progreso)),
         progreso_detalle = coalesce(p_detalle, progreso_detalle),
         lease_expires_at = now() + interval '5 minutes'
   where id = p_job_id and estado = 'RUNNING';
$$;

create or replace function public.completar_job(
  p_job_id uuid,
  p_result_ref jsonb,
  p_provider text default null,
  p_modelo text default null,
  p_tokens_input integer default 0,
  p_tokens_output integer default 0,
  p_costo numeric default 0
) returns public.jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.jobs;
begin
  update public.jobs
     set estado = 'COMPLETED', progreso = 100, finished_at = now(),
         result_ref = p_result_ref,
         provider = coalesce(p_provider, provider),
         modelo = coalesce(p_modelo, modelo),
         tokens_input = coalesce(p_tokens_input, tokens_input),
         tokens_output = coalesce(p_tokens_output, tokens_output),
         costo_real_usd = coalesce(p_costo, costo_real_usd),
         lease_expires_at = null, cancel_solicitada = false
   where id = p_job_id and estado = 'RUNNING'
   returning * into v_job;
  return v_job;  -- null si el job no estaba RUNNING (ya cancelado/expirado)
end;
$$;

-- fallar_job — clasifica: reintentable + intentos disponibles -> RETRYING
-- con backoff exponencial + jitter; si no -> FAILED + copia a dead letter.
create or replace function public.fallar_job(
  p_job_id uuid,
  p_error_seguro text,
  p_error_interno_ref text default null,
  p_reintentable boolean default true
) returns public.jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.jobs;
  v_backoff interval;
begin
  select * into v_job from public.jobs where id = p_job_id for update;
  if not found or v_job.estado <> 'RUNNING' then
    return v_job;  -- idempotente
  end if;

  if p_reintentable and v_job.intentos < v_job.max_intentos then
    -- base 2s * 2^intentos, tope 60s, jitter [0.5, 1.0)
    v_backoff := least(interval '60 seconds',
                       interval '2 seconds' * power(2, least(v_job.intentos, 6)))
                 * (0.5 + random() * 0.5);
    update public.jobs
       set estado = 'RETRYING', error_seguro = p_error_seguro,
           error_interno_ref = p_error_interno_ref,
           next_attempt_at = now() + v_backoff, lease_expires_at = null
     where id = p_job_id
     returning * into v_job;
  else
    update public.jobs
       set estado = 'FAILED', finished_at = now(), error_seguro = p_error_seguro,
           error_interno_ref = p_error_interno_ref, lease_expires_at = null
     where id = p_job_id
     returning * into v_job;

    insert into public.jobs_dead_letter (
      job_id, organization_id, tipo, recurso_tipo, recurso_id, input_json,
      intentos, error_seguro, error_interno_ref, motivo
    ) values (
      v_job.id, v_job.organization_id, v_job.tipo, v_job.recurso_tipo,
      v_job.recurso_id, v_job.input_json, v_job.intentos, p_error_seguro,
      p_error_interno_ref,
      case when p_reintentable then 'max_intentos' else 'error_no_reintentable' end
    );
  end if;

  return v_job;
end;
$$;

-- reencolar_step_job — para jobs multi-step (ADR 0002): el step terminó,
-- quedan más; se persiste el progreso parcial y el job vuelve a la cola.
create or replace function public.reencolar_step_job(
  p_job_id uuid,
  p_step text,
  p_result_parcial jsonb default null,
  p_progreso smallint default null
) returns public.jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.jobs;
begin
  update public.jobs
     set estado = 'AUTHORIZED', step_actual = p_step,
         result_ref = coalesce(p_result_parcial, result_ref),
         progreso = greatest(progreso, coalesce(p_progreso, progreso)),
         lease_expires_at = null, next_attempt_at = null
   where id = p_job_id and estado = 'RUNNING'
   returning * into v_job;
  return v_job;
end;
$$;

-- expirar_jobs — barre jobs que pasaron su expires_at sin completarse, y
-- jobs RUNNING con lease vencido que ya agotaron sus intentos. Llamado por
-- pg_cron / Vercel Cron (incremento A3).
create or replace function public.expirar_jobs()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with expirados as (
    update public.jobs
       set estado = 'EXPIRED', finished_at = now(), lease_expires_at = null
     where estado in ('PENDING', 'AUTHORIZED', 'RETRYING')
       and expires_at < now()
     returning 1
  )
  select count(*) into v_count from expirados;

  -- Jobs RUNNING abandonados (worker muerto) sin intentos restantes.
  update public.jobs
     set estado = 'FAILED', finished_at = now(), lease_expires_at = null,
         error_seguro = coalesce(error_seguro, 'El procesamiento se interrumpió y no pudo reanudarse')
   where estado = 'RUNNING'
     and lease_expires_at < now() - interval '1 minute'
     and intentos >= max_intentos;

  return v_count;
end;
$$;

-- ============================================================================
-- GRANTS
-- ============================================================================
revoke all on function public.job_recurso_pertenece(text, uuid, uuid) from public;
revoke all on function public.crear_job(text, text, uuid, jsonb, text, smallint, text, smallint, interval) from public;
revoke all on function public.cancelar_job(uuid) from public;
revoke all on function public.reclamar_jobs(text, int) from public;
revoke all on function public.progreso_job(uuid, smallint, text) from public;
revoke all on function public.completar_job(uuid, jsonb, text, text, integer, integer, numeric) from public;
revoke all on function public.fallar_job(uuid, text, text, boolean) from public;
revoke all on function public.reencolar_step_job(uuid, text, jsonb, smallint) from public;
revoke all on function public.expirar_jobs() from public;

grant execute on function public.crear_job(text, text, uuid, jsonb, text, smallint, text, smallint, interval) to authenticated;
grant execute on function public.cancelar_job(uuid) to authenticated;

-- Funciones del worker: solo service_role (el worker corre con service key).
grant execute on function public.reclamar_jobs(text, int) to service_role;
grant execute on function public.progreso_job(uuid, smallint, text) to service_role;
grant execute on function public.completar_job(uuid, jsonb, text, text, integer, integer, numeric) to service_role;
grant execute on function public.fallar_job(uuid, text, text, boolean) to service_role;
grant execute on function public.reencolar_step_job(uuid, text, jsonb, smallint) to service_role;
grant execute on function public.expirar_jobs() to service_role;
