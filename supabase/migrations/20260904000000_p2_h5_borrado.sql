-- P2 · H5 — Borrado de organización orquestado con ventana de gracia
-- (P2.6, ADR 0010).
--
-- ON DELETE CASCADE NO es el plan de borrado: es el ÚLTIMO paso. Antes:
-- export (H4), ventana de gracia de 7 días reversible, revocación de
-- sesiones, borrado de Storage por prefijo, cancelación de jobs en vuelo,
-- y un sello inmutable (audit_log + retencion_archive con el hash del
-- manifiesto de borrado).
--
-- Flujo:
--   solicitar_borrado_organizacion(confirmacion)  [ADMIN]
--     -> deletion_requests (PROGRAMADA, programada_para = now()+7d)
--     -> encola un job exportar-organizacion
--   [ventana de gracia: cancelar_borrado_organizacion() revierte]
--   cron /api/cron/borrados (diario)
--     -> promover_borrados_vencidos(): PROGRAMADA y vencida -> EN_PROCESO,
--        encola job borrar-organizacion
--   handler borrar-organizacion (multi-step, ver _shared/job-handlers/)
--     -> COMPLETADA + manifiesto_hash
--
-- Rollback:
--   alter table public.jobs drop constraint jobs_tipo_check;
--   alter table public.jobs add constraint jobs_tipo_check check (tipo in (... sin 'borrar-organizacion'));
--   drop function if exists public.solicitar_borrado_organizacion(text);
--   drop function if exists public.cancelar_borrado_organizacion();
--   drop function if exists public.promover_borrados_vencidos();
--   drop function if exists public.revocar_sesiones_organizacion(uuid);
--   drop function if exists public.sellar_borrado_organizacion(uuid, jsonb);
--   drop table if exists public.deletion_requests;

-- ── audit_log: organization_id / actor_id pasan a ser HISTÓRICOS ────────
-- La FK `on delete set null` obliga a un UPDATE de audit_log al borrar la
-- organización o un usuario — y el trigger de inmutabilidad lo rechaza
-- (bloqueaba el borrado por completo). Un log de auditoría a prueba de
-- manipulación DEBE conservar el id original para siempre; se quitan las
-- dos FK y las columnas quedan como uuid histórico (puede apuntar a filas
-- ya borradas — eso es lo correcto para una bitácora). La cadena por hash
-- de cada organización sigue verificable tras su borrado.
-- safe: sólo se elimina la restricción FK; no se pierde ningún dato ni se toca ninguna fila.
alter table public.audit_log drop constraint audit_log_organization_id_fkey;
-- safe: idem — se conserva el actor_id como valor histórico.
alter table public.audit_log drop constraint audit_log_actor_id_fkey;

-- ── tipo de job ─────────────────────────────────────────────────────────
alter table public.jobs drop constraint jobs_tipo_check;
alter table public.jobs add constraint jobs_tipo_check check (tipo in (
  'noop', 'noop-ef',
  'procesar-documento', 'analizar-bases', 'generar-estudio-mercado',
  'generar-preguntas-junta', 'generar-propuesta-tecnica',
  'auditar-documento', 'auditar-expediente', 'seguimiento-analizar-fallo',
  'analizar-documento-corporativo', 'procesar-referencia-legal',
  'exportar-organizacion', 'borrar-organizacion'
));

-- ── solicitudes de borrado ─────────────────────────────────────────────
create table public.deletion_requests (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  solicitada_por   uuid references public.users (id) on delete set null,
  tipo             text not null default 'FULL' check (tipo in ('FULL')),
  estado           text not null default 'PROGRAMADA'
                     check (estado in ('PROGRAMADA', 'EN_PROCESO', 'COMPLETADA', 'CANCELADA', 'FALLIDA')),
  gracia_dias      integer not null default 7 check (gracia_dias between 0 and 90),
  programada_para  timestamptz not null,
  confirmacion     text not null,           -- debe igualar organizations.nombre
  export_job_id    uuid,
  borrado_job_id   uuid,
  datos_purgados_at timestamptz,   -- el job terminó de purgar; falta el DELETE de la org
  manifiesto_hash  text,
  detalle_json     jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- una sola solicitud activa por organización
create unique index deletion_requests_una_activa
  on public.deletion_requests (organization_id)
  where estado in ('PROGRAMADA', 'EN_PROCESO');

create index deletion_requests_vencidas_idx
  on public.deletion_requests (programada_para)
  where estado = 'PROGRAMADA';

comment on table public.deletion_requests is
  'P2.6 — solicitudes de borrado de organización con ventana de gracia (ADR 0010). Escritura solo vía RPC.';

alter table public.deletion_requests enable row level security;
-- Los ADMIN de la organización ven su propia solicitud (para el aviso de
-- "borrado programado / cancelar"). Sin INSERT/UPDATE/DELETE directo.
create policy deletion_requests_select_own_org on public.deletion_requests
  for select using (organization_id = public.user_org_id());

create or replace function public._deletion_requests_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;
create trigger deletion_requests_touch before update on public.deletion_requests
  for each row execute function public._deletion_requests_touch();

-- ── solicitar ──────────────────────────────────────────────────────────
create or replace function public.solicitar_borrado_organizacion(p_confirmacion text)
returns public.deletion_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org   uuid;
  v_actor uuid := auth.uid();
  v_rol   text;
  v_nombre text;
  v_req   public.deletion_requests;
  v_job   public.jobs;
begin
  if v_actor is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;
  v_org := public.user_org_id();
  select rol into v_rol from public.users where id = v_actor;
  if v_org is null or v_rol is distinct from 'ADMIN' then
    raise exception 'Solo un ADMIN de la organización puede solicitar el borrado'
      using errcode = '42501';
  end if;

  select nombre into v_nombre from public.organizations where id = v_org;
  if p_confirmacion is distinct from v_nombre then
    raise exception 'La confirmación no coincide con el nombre de la organización'
      using errcode = 'P0001', hint = 'borrado_org:confirmacion';
  end if;

  if exists (
    select 1 from public.deletion_requests
    where organization_id = v_org and estado in ('PROGRAMADA', 'EN_PROCESO')
  ) then
    raise exception 'Ya hay un borrado en curso para esta organización'
      using errcode = 'P0001', hint = 'borrado_org:ya_existe';
  end if;

  insert into public.deletion_requests
    (organization_id, solicitada_por, programada_para, confirmacion)
  values
    (v_org, v_actor, now() + interval '7 days', p_confirmacion)
  returning * into v_req;

  -- Export inmediato (paso 1 del ADR). Reutiliza la vía normal de jobs.
  insert into public.jobs
    (organization_id, requested_by, tipo, recurso_tipo, recurso_id,
     estado, prioridad, max_intentos, idempotency_key, input_json, authorized_at, expires_at)
  values
    (v_org, v_actor, 'exportar-organizacion', 'organizacion', v_org,
     'AUTHORIZED', 80, 3, 'export-borrado:' || v_req.id::text,
     jsonb_build_object('motivo', 'borrado_organizacion', 'deletion_request_id', v_req.id),
     now(), now() + interval '7 days')
  returning * into v_job;

  update public.deletion_requests set export_job_id = v_job.id where id = v_req.id
  returning * into v_req;

  -- Bitácora inmutable (la organización todavía existe).
  perform public.registrar_auditoria(
    'organizacion_borrado_solicitado', 'organizacion', v_org,
    jsonb_build_object('deletion_request_id', v_req.id, 'programada_para', v_req.programada_para)
  );

  return v_req;
end;
$$;
revoke all on function public.solicitar_borrado_organizacion(text) from public, anon;
grant execute on function public.solicitar_borrado_organizacion(text) to authenticated;

-- ── cancelar (dentro de la ventana de gracia) ──────────────────────────
create or replace function public.cancelar_borrado_organizacion()
returns public.deletion_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_actor uuid := auth.uid();
  v_rol text;
  v_req public.deletion_requests;
begin
  if v_actor is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;
  v_org := public.user_org_id();
  select rol into v_rol from public.users where id = v_actor;
  if v_org is null or v_rol is distinct from 'ADMIN' then
    raise exception 'Solo un ADMIN puede cancelar el borrado' using errcode = '42501';
  end if;

  update public.deletion_requests
     set estado = 'CANCELADA'
   where organization_id = v_org and estado = 'PROGRAMADA'
  returning * into v_req;

  if not found then
    raise exception 'No hay un borrado cancelable (ya en proceso o inexistente)'
      using errcode = 'P0002';
  end if;

  perform public.registrar_auditoria(
    'organizacion_borrado_cancelado', 'organizacion', v_org,
    jsonb_build_object('deletion_request_id', v_req.id)
  );
  return v_req;
end;
$$;
revoke all on function public.cancelar_borrado_organizacion() from public, anon;
grant execute on function public.cancelar_borrado_organizacion() to authenticated;

-- ── promover las vencidas (cron) ───────────────────────────────────────
create or replace function public.promover_borrados_vencidos()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.deletion_requests;
  v_job public.jobs;
  v_promovidos jsonb := '[]'::jsonb;
begin
  for v_req in
    select * from public.deletion_requests
    where estado = 'PROGRAMADA' and programada_para <= now()
    order by programada_para
  loop
    -- El export debe estar COMPLETED. Si no, se deja para el siguiente tick
    -- (el job de export reintenta por su cuenta).
    if not exists (
      select 1 from public.jobs
      where id = v_req.export_job_id and estado = 'COMPLETED'
    ) then
      continue;
    end if;

    insert into public.jobs
      (organization_id, requested_by, tipo, recurso_tipo, recurso_id,
       estado, prioridad, max_intentos, idempotency_key, input_json, authorized_at, expires_at)
    values
      (v_req.organization_id, v_req.solicitada_por, 'borrar-organizacion', 'organizacion',
       v_req.organization_id, 'AUTHORIZED', 50, 3, 'borrado:' || v_req.id::text,
       jsonb_build_object('deletion_request_id', v_req.id, 'export_job_id', v_req.export_job_id),
       now(), now() + interval '3 days')
    returning * into v_job;

    update public.deletion_requests
       set estado = 'EN_PROCESO', borrado_job_id = v_job.id
     where id = v_req.id;

    v_promovidos := v_promovidos || jsonb_build_object(
      'deletion_request_id', v_req.id, 'organization_id', v_req.organization_id, 'job_id', v_job.id
    );
  end loop;

  return jsonb_build_object('generado_at', now(), 'promovidos', v_promovidos);
end;
$$;
revoke all on function public.promover_borrados_vencidos() from public, anon, authenticated;
grant execute on function public.promover_borrados_vencidos() to service_role;

-- ── finalizar (cron): DELETE de la organización tras el job ─────────────
-- Se hace FUERA de cualquier job: `DELETE FROM organizations` dispara el
-- CASCADE que, entre otras, borraría la fila `jobs` del propio job de
-- borrado. Precondición: el job borrar-organizacion COMPLETED y
-- datos_purgados_at fijado (sesiones/Storage/cuentas ya limpias + sello
-- inmutable escrito).
create or replace function public.finalizar_borrados_completados()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.deletion_requests;
  v_hash text;
  v_finalizados jsonb := '[]'::jsonb;
begin
  for v_req in
    select dr.* from public.deletion_requests dr
    join public.jobs j on j.id = dr.borrado_job_id
    where dr.estado = 'EN_PROCESO'
      and dr.datos_purgados_at is not null
      and j.estado = 'COMPLETED'
    order by dr.datos_purgados_at
  loop
    v_hash := v_req.manifiesto_hash;

    -- ÚLTIMO paso: el CASCADE de organizations limpia el dominio entero.
    -- audit_log (on delete set null) y retencion_archive (sin FK) conservan
    -- la evidencia con el hash del manifiesto.
    delete from public.organizations where id = v_req.organization_id;

    v_finalizados := v_finalizados || jsonb_build_object(
      'deletion_request_id', v_req.id,
      'organization_id', v_req.organization_id,
      'manifiesto_hash', v_hash
    );
  end loop;

  return jsonb_build_object('generado_at', now(), 'finalizados', v_finalizados);
end;
$$;
revoke all on function public.finalizar_borrados_completados() from public, anon, authenticated;
grant execute on function public.finalizar_borrados_completados() to service_role;

-- ── revocar sesiones de una organización ───────────────────────────────
create or replace function public.revocar_sesiones_organizacion(p_org uuid)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_n integer;
begin
  delete from auth.refresh_tokens
   where user_id in (select id::text from public.users where organization_id = p_org);

  with borradas as (
    delete from auth.sessions
     where user_id in (select id from public.users where organization_id = p_org)
    returning 1
  )
  select count(*) into v_n from borradas;

  return coalesce(v_n, 0);
end;
$$;
revoke all on function public.revocar_sesiones_organizacion(uuid) from public, anon, authenticated;
grant execute on function public.revocar_sesiones_organizacion(uuid) to service_role;

-- ── purgar las cuentas de una organización ─────────────────────────────
-- Borra las filas de auth.users de los miembros (cascade -> identities,
-- sessions, refresh_tokens, y public.users por users_id_fkey). Ya no toca
-- audit_log (se quitó la FK arriba). Devuelve cuántas cuentas.
create or replace function public.purgar_cuentas_organizacion(p_org uuid)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_n integer;
begin
  with borradas as (
    delete from auth.users
     where id in (select id from public.users where organization_id = p_org)
    returning 1
  )
  select count(*) into v_n from borradas;
  return coalesce(v_n, 0);
end;
$$;
revoke all on function public.purgar_cuentas_organizacion(uuid) from public, anon, authenticated;
grant execute on function public.purgar_cuentas_organizacion(uuid) to service_role;

-- ── sello inmutable del borrado ────────────────────────────────────────
-- Escribe la evidencia ANTES de borrar la organización (todavía existe):
--   1. audit_log (encadenado, org todavía viva)
--   2. retencion_archive (manifiesto completo + hash; inmutable, sin FK a
--      organizations -> sobrevive al borrado)
-- Devuelve el hash del manifiesto.
create or replace function public.sellar_borrado_organizacion(p_org uuid, p_manifiesto jsonb)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_actor uuid;
  v_prev  text;
  v_hash  text;
  v_manifiesto jsonb;
begin
  v_hash := encode(extensions.digest(p_manifiesto::text, 'sha256'), 'hex');
  v_manifiesto := p_manifiesto || jsonb_build_object('manifiesto_sha256', v_hash, 'sellado_at', now());

  select solicitada_por into v_actor from public.deletion_requests
   where organization_id = p_org and estado = 'EN_PROCESO' limit 1;

  -- audit_log encadenado sobre la cadena de la organización
  select hash into v_prev from public.audit_log
   where organization_id is not distinct from p_org order by id desc limit 1;
  insert into public.audit_log
    (organization_id, actor_id, accion, recurso_tipo, recurso_id, detalle_json, prev_hash, hash)
  values (
    p_org, v_actor, 'organizacion_borrada', 'organizacion', p_org,
    jsonb_build_object('manifiesto_sha256', v_hash, 'tablas', p_manifiesto->'tablas',
                       'storage_archivos', p_manifiesto->'storage_archivos'),
    v_prev,
    encode(extensions.digest(coalesce(v_prev,'') || p_org::text || 'organizacion_borrada' || v_hash || now()::text, 'sha256'), 'hex')
  );

  insert into public.retencion_archive (recurso, fila_id, fila, organization_id)
  values ('deletion_manifest', p_org::text, v_manifiesto, p_org);

  return v_hash;
end;
$$;
revoke all on function public.sellar_borrado_organizacion(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.sellar_borrado_organizacion(uuid, jsonb) to service_role;

-- ── flag ───────────────────────────────────────────────────────────────
insert into public.feature_flags (key, descripcion) values
  ('datos.borrado_organizacion', 'P2.6 H5 — autoservicio de borrado de organización con ventana de gracia (ADMIN)')
on conflict (key) do nothing;
