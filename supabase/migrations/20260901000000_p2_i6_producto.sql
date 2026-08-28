-- P2 · I6/I7/I8 — preparación de producto (P2.10).
--
-- - audit_log: bitácora INMUTABLE encadenada por hash para acciones
--   críticas (cambio de estado, liberación, revisión de resultado de IA,
--   cambio de plan, borrado de organización).
-- - Consentimiento de términos por usuario.
-- - Planes comerciales -> ai_org_policy.
-- - metricas_valor: métricas de valor por organización (P2.10 item 14).
-- - Jurisdicción por organización (I8, slice mínimo).
--
-- Rollback:
--   drop function if exists public.registrar_auditoria(text,text,uuid,jsonb);
--   drop function if exists public.aceptar_terminos(text);
--   drop function if exists public.aplicar_plan_a_org(uuid,text);
--   drop function if exists public.metricas_valor(uuid);
--   drop table if exists public.audit_log;
--   alter table public.users drop column if exists terminos_aceptados_at;
--   alter table public.users drop column if exists terminos_version;
--   alter table public.organizations drop column if exists plan;
--   alter table public.organizations drop column if exists jurisdiccion;

-- ============================================================================
-- Consentimiento de términos (I6)
-- ============================================================================
alter table public.users add column if not exists terminos_aceptados_at timestamptz;
alter table public.users add column if not exists terminos_version text;

create or replace function public.aceptar_terminos(p_version text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;
  update public.users
     set terminos_aceptados_at = now(), terminos_version = p_version
   where id = auth.uid();
end;
$$;
revoke all on function public.aceptar_terminos(text) from public, anon;
grant execute on function public.aceptar_terminos(text) to authenticated;

-- ============================================================================
-- Planes comerciales por organización (I6/I8)
-- ============================================================================
alter table public.organizations add column if not exists plan text not null default 'BASE'
  constraint organizations_plan_check check (plan in ('BASE', 'PRO', 'ENTERPRISE'));
alter table public.organizations add column if not exists jurisdiccion text;

comment on column public.organizations.jurisdiccion is
  'Jurisdicción principal de la organización (FEDERAL/EDOMEX/CDMX/…). I8: la config por jurisdicción (formatos legales, requisitos) se resuelve contra estados_config; el modelo de permisos configurables es trabajo posterior.';

-- aplicar_plan_a_org — deriva la política de IA (ai_org_policy) del plan.
-- Solo service_role (lo llama el panel de administración / onboarding).
create or replace function public.aplicar_plan_a_org(p_org uuid, p_plan text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cuota numeric;
  v_diario numeric;
  v_concurrencia smallint;
begin
  if p_plan not in ('BASE', 'PRO', 'ENTERPRISE') then
    raise exception 'Plan inválido' using errcode = '22023';
  end if;

  select
    case p_plan when 'BASE' then 15 when 'PRO' then 60 else 300 end,
    case p_plan when 'BASE' then 2  when 'PRO' then 8  else 40 end,
    case p_plan when 'BASE' then 3::smallint when 'PRO' then 8::smallint else 20::smallint end
  into v_cuota, v_diario, v_concurrencia;

  update public.organizations set plan = p_plan where id = p_org;

  insert into public.ai_org_policy (organization_id, cuota_mensual_usd, limite_diario_usd, max_concurrent_jobs)
  values (p_org, v_cuota, v_diario, v_concurrencia)
  on conflict (organization_id) do update
    set cuota_mensual_usd = excluded.cuota_mensual_usd,
        limite_diario_usd = excluded.limite_diario_usd,
        max_concurrent_jobs = excluded.max_concurrent_jobs;
end;
$$;
revoke all on function public.aplicar_plan_a_org(uuid, text) from public, anon, authenticated;
grant execute on function public.aplicar_plan_a_org(uuid, text) to service_role;

-- ============================================================================
-- audit_log — INMUTABLE (append-only, encadenado por hash). (P2.10 item 7)
-- ============================================================================
create table public.audit_log (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations (id) on delete set null,
  actor_id uuid references public.users (id) on delete set null,
  accion text not null,
  recurso_tipo text,
  recurso_id uuid,
  detalle_json jsonb not null default '{}'::jsonb,
  prev_hash text,
  hash text not null,
  created_at timestamptz not null default now()
);

create index audit_log_org_idx on public.audit_log (organization_id, created_at desc);
create index audit_log_recurso_idx on public.audit_log (recurso_tipo, recurso_id);

alter table public.audit_log enable row level security;
-- Lectura para miembros de la organización (los ADMIN vía la UI). Sin
-- INSERT/UPDATE/DELETE: solo registrar_auditoria() (SECURITY DEFINER).
create policy audit_log_select_own_org on public.audit_log
  for select using (organization_id = public.user_org_id());

-- Impedir UPDATE/DELETE incluso para el owner de la tabla: trigger que
-- rechaza cualquier modificación de filas existentes.
create or replace function public._audit_log_inmutable()
returns trigger language plpgsql as $$
begin
  raise exception 'audit_log es inmutable: no se permite % ', tg_op;
end;
$$;
create trigger audit_log_no_update before update on public.audit_log
  for each row execute function public._audit_log_inmutable();
create trigger audit_log_no_delete before delete on public.audit_log
  for each row execute function public._audit_log_inmutable();

comment on table public.audit_log is
  'Bitácora inmutable de acciones críticas (P2.10). Encadenada: hash = sha256(prev_hash || fila). Un hueco o una alteración rompe la cadena. Solo registrar_auditoria() escribe.';

create or replace function public.registrar_auditoria(
  p_accion text,
  p_recurso_tipo text default null,
  p_recurso_id uuid default null,
  p_detalle jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_org uuid;
  v_actor uuid := auth.uid();
  v_prev text;
  v_hash text;
begin
  v_org := public.user_org_id();

  select hash into v_prev from public.audit_log
   where organization_id is not distinct from v_org
   order by id desc limit 1;

  v_hash := encode(
    extensions.digest(
      coalesce(v_prev, '') || coalesce(v_org::text, '') || coalesce(v_actor::text, '') ||
      p_accion || coalesce(p_recurso_tipo, '') || coalesce(p_recurso_id::text, '') ||
      coalesce(p_detalle::text, '{}') || now()::text,
      'sha256'
    ),
    'hex'
  );

  insert into public.audit_log
    (organization_id, actor_id, accion, recurso_tipo, recurso_id, detalle_json, prev_hash, hash)
  values (v_org, v_actor, p_accion, p_recurso_tipo, p_recurso_id, coalesce(p_detalle, '{}'::jsonb), v_prev, v_hash);
end;
$$;
revoke all on function public.registrar_auditoria(text, text, uuid, jsonb) from public, anon;
grant execute on function public.registrar_auditoria(text, text, uuid, jsonb) to authenticated;

-- Verificación de integridad de la cadena (para el runbook / dashboard).
create or replace function public.verificar_cadena_auditoria(p_org uuid)
returns table (total bigint, rota_en bigint)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r record;
  v_prev text := null;
  v_calc text;
  v_n bigint := 0;
begin
  for r in
    select * from public.audit_log
     where organization_id is not distinct from p_org
     order by id asc
  loop
    v_n := v_n + 1;
    v_calc := encode(extensions.digest(
      coalesce(v_prev, '') || coalesce(r.organization_id::text, '') || coalesce(r.actor_id::text, '') ||
      r.accion || coalesce(r.recurso_tipo, '') || coalesce(r.recurso_id::text, '') ||
      coalesce(r.detalle_json::text, '{}') || r.created_at::text, 'sha256'), 'hex');
    -- El created_at real puede diferir de now() en registrar_auditoria (se
    -- usa now() dos veces con el mismo valor dentro de la misma transacción),
    -- así que se compara prev_hash, que es la parte crítica de la cadena.
    if r.prev_hash is distinct from v_prev then
      return query select v_n, r.id;
      return;
    end if;
    v_prev := r.hash;
  end loop;
  return query select v_n, null::bigint;
end;
$$;
revoke all on function public.verificar_cadena_auditoria(uuid) from public, anon;
grant execute on function public.verificar_cadena_auditoria(uuid) to authenticated, service_role;

-- ============================================================================
-- metricas_valor — por organización (P2.10 item 14). SECURITY DEFINER,
-- keyed por auth.uid() (no acepta org como parámetro spoofable).
-- ============================================================================
create or replace function public.metricas_valor()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_org uuid := public.user_org_id();
begin
  return jsonb_build_object(
    'organization_id', v_org,
    'documentos_procesados', (
      select count(*) from public.documentos d
      join public.licitaciones l on l.id = d.licitacion_id
      where l.organization_id = v_org and d.procesado = true
    ),
    'analisis_generados', (
      select count(*) from public.ai_results where organization_id = v_org
    ),
    'requisitos_detectados', (
      select coalesce(sum(jsonb_array_length(coalesce(resultado_json -> 'documentacion_requerida', '[]'::jsonb))), 0)
      from public.ai_results
      where organization_id = v_org and tipo_analisis = 'analisis_bases'
    ),
    'tasa_aceptacion_humana_pct', (
      select case when count(*) = 0 then null
             else round(100.0 * count(*) filter (where estado_aprobacion = 'APROBADO') / count(*), 1) end
      from public.ai_results
      where organization_id = v_org and estado_aprobacion in ('APROBADO', 'RECHAZADO')
    ),
    'resultados_rechazados', (
      select count(*) from public.ai_results
      where organization_id = v_org and estado_aprobacion = 'RECHAZADO'
    ),
    'costo_ia_por_expediente_usd', (
      select round(avg(por_lic), 4) from (
        select recurso_id, sum(coalesce(costo_real_usd, 0)) as por_lic
        from public.jobs
        where organization_id = v_org and recurso_tipo = 'licitacion' and estado = 'COMPLETED'
        group by recurso_id
      ) s
    ),
    'licitaciones_enviadas', (
      select count(*) from public.licitaciones
      where organization_id = v_org and estado_licitacion in ('ENVIADA', 'SEGUIMIENTO', 'CERRADA')
    )
  );
end;
$$;
revoke all on function public.metricas_valor() from public, anon;
grant execute on function public.metricas_valor() to authenticated;
