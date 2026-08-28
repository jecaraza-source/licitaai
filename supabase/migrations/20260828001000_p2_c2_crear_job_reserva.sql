-- P2 · C2 — enlazar la reserva de presupuesto al job (ADR 0004).
--
-- crear_job gana el parámetro p_reserva_id (la ruta reserva presupuesto
-- ANTES de crear el job cuando el flag ai.gobierno_costo está activo, y
-- pasa el reserva_id aquí). liberar_mi_reserva_ia deja que la ruta libere
-- su propia reserva si la creación del job falla después.
--
-- Rollback: restaurar crear_job sin p_reserva_id (ver migración
--   20260827001000) y `drop function public.liberar_mi_reserva_ia(uuid);`

drop function if exists public.crear_job(text, text, uuid, jsonb, text, smallint, text, smallint, interval);

create function public.crear_job(
  p_tipo text,
  p_recurso_tipo text default null,
  p_recurso_id uuid default null,
  p_input jsonb default '{}'::jsonb,
  p_idempotency_key text default null,
  p_prioridad smallint default 100,
  p_dedup_hash text default null,
  p_max_intentos smallint default 3,
  p_expires_in interval default interval '24 hours',
  p_reserva_id uuid default null
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

  if p_idempotency_key is not null then
    select * into v_job from public.jobs
     where organization_id = v_org and idempotency_key = p_idempotency_key;
    if found then
      return v_job;
    end if;
  end if;

  if p_recurso_tipo is not null then
    if not public.job_recurso_pertenece(p_recurso_tipo, p_recurso_id, v_org) then
      raise exception 'Recurso no encontrado' using errcode = 'P0002';
    end if;
  end if;

  insert into public.jobs (
    organization_id, requested_by, tipo, recurso_tipo, recurso_id,
    estado, prioridad, intentos, max_intentos, idempotency_key, dedup_hash,
    input_json, reserva_id, authorized_at, expires_at
  ) values (
    v_org, auth.uid(), p_tipo, p_recurso_tipo, p_recurso_id,
    'AUTHORIZED', coalesce(p_prioridad, 100), 0, coalesce(p_max_intentos, 3),
    p_idempotency_key, p_dedup_hash,
    coalesce(p_input, '{}'::jsonb), p_reserva_id, now(),
    now() + coalesce(p_expires_in, interval '24 hours')
  )
  returning * into v_job;

  return v_job;
end;
$$;

revoke all on function public.crear_job(text, text, uuid, jsonb, text, smallint, text, smallint, interval, uuid) from public;
grant execute on function public.crear_job(text, text, uuid, jsonb, text, smallint, text, smallint, interval, uuid) to authenticated;

-- ============================================================================
-- liberar_mi_reserva_ia — versión para authenticated: deriva la organización
-- de auth.uid() y solo libera reservas de la propia organización.
-- ============================================================================
create or replace function public.liberar_mi_reserva_ia(p_reserva_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  if auth.uid() is null or p_reserva_id is null then
    return;
  end if;
  v_org := public.user_org_id();

  -- Solo si la reserva es de la organización del llamante.
  if not exists (
    select 1 from public.ai_budget_ledger
    where reserva_id = p_reserva_id and organization_id = v_org
  ) then
    return;
  end if;

  perform public.liberar_reserva_ia(v_org, p_reserva_id);
end;
$$;

revoke all on function public.liberar_mi_reserva_ia(uuid) from public;
grant execute on function public.liberar_mi_reserva_ia(uuid) to authenticated;
