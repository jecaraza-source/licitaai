-- P2 · C1 — gobierno de costo de IA por organización (ADR 0004).
--
-- Modelo: reserva -> ejecución -> conciliación, sobre un ledger append-only
-- en Postgres. Antes de llamar a un modelo se RESERVA el costo estimado;
-- al terminar se CONCILIA con el costo real (y se libera el sobrante); si
-- falla sin producir tokens, se LIBERA la reserva completa.
--
-- gastado_periodo = sum(RESERVADO) + sum(CONSUMIDO) - sum(LIBERADO)
--
-- Todo detrás del flag `ai.gobierno_costo` en la capa de aplicación: esta
-- migración solo crea el esquema y las funciones; la ruta y el worker
-- deciden si las usan (incrementos C2/C3).
--
-- El tope diario global de tokens de P0.6 (check_ai_budget /
-- AI_DAILY_TOKEN_CAP) se mantiene como red de seguridad de último recurso.
--
-- Rollback:
--   drop function if exists public.reservar_presupuesto_ia(text,numeric,uuid);
--   drop function if exists public.conciliar_presupuesto_ia(uuid,uuid,integer,integer,text);
--   drop function if exists public.liberar_reserva_ia(uuid,uuid);
--   drop function if exists public.estimar_costo_ia(text,integer,integer);
--   drop function if exists public.ai_policy_de_org(uuid);
--   drop function if exists public.presupuesto_ia_disponible(uuid);
--   drop table if exists public.ai_budget_ledger;
--   drop table if exists public.ai_org_policy;
--   drop table if exists public.ai_model_pricing;

-- ============================================================================
-- ai_model_pricing — catálogo global de precios (USD por 1M tokens).
-- Se mantiene a mano cuando un proveedor cambia precios (ver ADR 0004 §consecuencias).
-- ============================================================================
create table public.ai_model_pricing (
  modelo text primary key,
  input_usd_por_1m numeric(12, 4) not null,
  output_usd_por_1m numeric(12, 4) not null,
  actualizado_at timestamptz not null default now()
);

insert into public.ai_model_pricing (modelo, input_usd_por_1m, output_usd_por_1m) values
  ('claude-opus-5',            5.0000, 25.0000),
  ('claude-sonnet-5',          2.0000, 10.0000),
  ('claude-haiku-4-5',         1.0000,  5.0000),
  ('claude-fable-5',          10.0000, 50.0000),
  ('text-embedding-3-small',   0.0200,  0.0000),
  ('text-embedding-3-small-mock', 0.0000, 0.0000)
on conflict (modelo) do nothing;

alter table public.ai_model_pricing enable row level security;
create policy ai_model_pricing_select_authenticated
  on public.ai_model_pricing for select to authenticated using (true);

-- ============================================================================
-- ai_org_policy — política de consumo por organización (1 fila, con defaults).
-- ============================================================================
create table public.ai_org_policy (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  cuota_mensual_usd numeric(12, 2) not null default 60,
  limite_diario_usd numeric(12, 2) not null default 10,
  limite_por_operacion_usd numeric(12, 4) not null default 2,
  max_concurrent_jobs smallint not null default 3,
  modelos_permitidos text[] not null default
    array['claude-sonnet-5', 'claude-haiku-4-5', 'claude-opus-5', 'text-embedding-3-small', 'text-embedding-3-small-mock'],
  politica_modelo text not null default 'economico_por_defecto'
    check (politica_modelo in ('economico_por_defecto', 'avanzado_si_confianza_baja', 'siempre_avanzado')),
  alertas_umbral_pct integer[] not null default array[50, 80, 95],
  max_reintentos_facturables smallint not null default 2,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger ai_org_policy_set_updated_at
  before update on public.ai_org_policy
  for each row execute function public.set_updated_at();

alter table public.ai_org_policy enable row level security;
-- Lectura para la propia organización (dashboard de consumo). Sin escritura
-- directa: la política se ajusta desde el panel de administración (P2.10) vía
-- service role, o por migración/seed.
create policy ai_org_policy_select_own_org
  on public.ai_org_policy for select
  using (organization_id = public.user_org_id());

-- ============================================================================
-- ai_budget_ledger — append-only. Nunca UPDATE/DELETE.
-- ============================================================================
create table public.ai_budget_ledger (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  job_id uuid,
  reserva_id uuid,
  tipo text,
  estado text not null check (estado in ('RESERVADO', 'CONSUMIDO', 'LIBERADO')),
  monto_usd numeric(14, 6) not null default 0 check (monto_usd >= 0),
  tokens_input integer not null default 0,
  tokens_output integer not null default 0,
  modelo text,
  cache_hit boolean not null default false,
  created_at timestamptz not null default now()
);

create index ai_budget_ledger_org_created_idx on public.ai_budget_ledger (organization_id, created_at desc);
create index ai_budget_ledger_reserva_idx on public.ai_budget_ledger (reserva_id) where reserva_id is not null;
create index ai_budget_ledger_job_idx on public.ai_budget_ledger (job_id) where job_id is not null;

alter table public.ai_budget_ledger enable row level security;
create policy ai_budget_ledger_select_own_org
  on public.ai_budget_ledger for select
  using (organization_id = public.user_org_id());

-- ============================================================================
-- ai_policy_de_org — devuelve la política de una organización, creándola
-- con defaults si no existe.
-- ============================================================================
create or replace function public.ai_policy_de_org(p_org uuid)
returns public.ai_org_policy
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pol public.ai_org_policy;
begin
  insert into public.ai_org_policy (organization_id) values (p_org)
  on conflict (organization_id) do nothing;
  select * into v_pol from public.ai_org_policy where organization_id = p_org;
  return v_pol;
end;
$$;

-- ============================================================================
-- estimar_costo_ia — costo en USD dado modelo + tokens.
-- ============================================================================
create or replace function public.estimar_costo_ia(
  p_modelo text,
  p_tokens_input integer,
  p_tokens_output integer
) returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select round(
        (greatest(coalesce(p_tokens_input, 0), 0) / 1000000.0) * input_usd_por_1m
      + (greatest(coalesce(p_tokens_output, 0), 0) / 1000000.0) * output_usd_por_1m
    , 6)
     from public.ai_model_pricing where modelo = p_modelo),
    -- Modelo desconocido: estimación conservadora con la tarifa de sonnet.
    round((greatest(coalesce(p_tokens_input, 0), 0) / 1000000.0) * 2.0
        + (greatest(coalesce(p_tokens_output, 0), 0) / 1000000.0) * 10.0, 6)
  );
$$;

-- ============================================================================
-- gasto de una organización en una ventana (helper interno).
-- ============================================================================
create or replace function public._gasto_ia_ventana(p_org uuid, p_desde timestamptz)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(
    case when estado in ('RESERVADO', 'CONSUMIDO') then monto_usd else -monto_usd end
  ), 0)
  from public.ai_budget_ledger
  where organization_id = p_org and created_at >= p_desde;
$$;

-- ============================================================================
-- presupuesto_ia_disponible — para el dashboard y el pre-check de la ruta.
-- ============================================================================
create or replace function public.presupuesto_ia_disponible(p_org uuid)
returns table (
  mensual_disponible_usd numeric,
  diario_disponible_usd numeric,
  cuota_mensual_usd numeric,
  limite_diario_usd numeric,
  limite_por_operacion_usd numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pol public.ai_org_policy;
begin
  v_pol := public.ai_policy_de_org(p_org);
  return query select
    greatest(v_pol.cuota_mensual_usd - public._gasto_ia_ventana(p_org, date_trunc('month', now())), 0),
    greatest(v_pol.limite_diario_usd - public._gasto_ia_ventana(p_org, date_trunc('day', now())), 0),
    v_pol.cuota_mensual_usd,
    v_pol.limite_diario_usd,
    v_pol.limite_por_operacion_usd;
end;
$$;

-- ============================================================================
-- reservar_presupuesto_ia — llamada por authenticated (ruta) antes de crear
-- un job de IA. Devuelve reserva_id, o lanza con un errcode específico.
-- ============================================================================
create or replace function public.reservar_presupuesto_ia(
  p_tipo text,
  p_estimado_usd numeric,
  p_job_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_pol public.ai_org_policy;
  v_estimado numeric := greatest(coalesce(p_estimado_usd, 0), 0);
  v_reserva uuid := gen_random_uuid();
begin
  if auth.uid() is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;
  v_org := public.user_org_id();
  v_pol := public.ai_policy_de_org(v_org);

  -- errcode P0001 (raise_exception estándar) para que PostgREST devuelva el
  -- mensaje; el código de máquina va en `hint` (lo lee mapearErrorRpcJob).
  if v_estimado > v_pol.limite_por_operacion_usd then
    raise exception 'La operación estimada ($%) excede el límite por operación ($%)',
      v_estimado, v_pol.limite_por_operacion_usd
      using errcode = 'P0001', hint = 'presupuesto_ia:limite_por_operacion';
  end if;

  if public._gasto_ia_ventana(v_org, date_trunc('day', now())) + v_estimado > v_pol.limite_diario_usd then
    raise exception 'Se alcanzó el límite diario de gasto de IA de la organización'
      using errcode = 'P0001', hint = 'presupuesto_ia:limite_diario';
  end if;

  if public._gasto_ia_ventana(v_org, date_trunc('month', now())) + v_estimado > v_pol.cuota_mensual_usd then
    raise exception 'Se agotó la cuota mensual de IA de la organización'
      using errcode = 'P0001', hint = 'presupuesto_ia:cuota_mensual';
  end if;

  insert into public.ai_budget_ledger (organization_id, job_id, reserva_id, tipo, estado, monto_usd)
  values (v_org, p_job_id, v_reserva, p_tipo, 'RESERVADO', v_estimado);

  return v_reserva;
end;
$$;

-- ============================================================================
-- conciliar_presupuesto_ia — llamada por el worker al terminar la llamada al
-- modelo. Cierra la reserva con el costo real (CONSUMIDO) y libera la
-- reserva (LIBERADO por el monto reservado). Idempotente por reserva.
-- ============================================================================
create or replace function public.conciliar_presupuesto_ia(
  p_organization_id uuid,
  p_reserva_id uuid,
  p_tokens_input integer,
  p_tokens_output integer,
  p_modelo text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservado numeric;
  v_real numeric;
  v_ya_conciliada boolean;
begin
  v_real := public.estimar_costo_ia(p_modelo, p_tokens_input, p_tokens_output);

  if p_reserva_id is not null then
    select exists (
      select 1 from public.ai_budget_ledger
      where reserva_id = p_reserva_id and estado in ('CONSUMIDO', 'LIBERADO')
    ) into v_ya_conciliada;
    if v_ya_conciliada then
      return; -- ya se concilió/liberó esta reserva
    end if;

    select monto_usd into v_reservado from public.ai_budget_ledger
      where reserva_id = p_reserva_id and estado = 'RESERVADO'
      order by id limit 1;

    if v_reservado is not null then
      insert into public.ai_budget_ledger
        (organization_id, reserva_id, estado, monto_usd, tokens_input, tokens_output, modelo)
      values (p_organization_id, p_reserva_id, 'LIBERADO', v_reservado, 0, 0, p_modelo);
    end if;
  end if;

  insert into public.ai_budget_ledger
    (organization_id, reserva_id, estado, monto_usd, tokens_input, tokens_output, modelo)
  values (
    p_organization_id, p_reserva_id, 'CONSUMIDO', v_real,
    greatest(coalesce(p_tokens_input, 0), 0), greatest(coalesce(p_tokens_output, 0), 0), p_modelo
  );
end;
$$;

-- ============================================================================
-- liberar_reserva_ia — llamada por el worker cuando el job falla sin haber
-- producido tokens facturables. Idempotente.
-- ============================================================================
create or replace function public.liberar_reserva_ia(
  p_organization_id uuid,
  p_reserva_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservado numeric;
  v_ya boolean;
begin
  if p_reserva_id is null then
    return;
  end if;
  select exists (
    select 1 from public.ai_budget_ledger
    where reserva_id = p_reserva_id and estado in ('CONSUMIDO', 'LIBERADO')
  ) into v_ya;
  if v_ya then
    return;
  end if;

  select monto_usd into v_reservado from public.ai_budget_ledger
    where reserva_id = p_reserva_id and estado = 'RESERVADO' order by id limit 1;
  if v_reservado is null then
    return;
  end if;

  insert into public.ai_budget_ledger (organization_id, reserva_id, estado, monto_usd)
  values (p_organization_id, p_reserva_id, 'LIBERADO', v_reservado);
end;
$$;

-- ============================================================================
-- GRANTS
-- ============================================================================
revoke all on function public.ai_policy_de_org(uuid) from public;
revoke all on function public.estimar_costo_ia(text, integer, integer) from public;
revoke all on function public._gasto_ia_ventana(uuid, timestamptz) from public;
revoke all on function public.presupuesto_ia_disponible(uuid) from public;
revoke all on function public.reservar_presupuesto_ia(text, numeric, uuid) from public;
revoke all on function public.conciliar_presupuesto_ia(uuid, uuid, integer, integer, text) from public;
revoke all on function public.liberar_reserva_ia(uuid, uuid) from public;

grant execute on function public.reservar_presupuesto_ia(text, numeric, uuid) to authenticated;
grant execute on function public.presupuesto_ia_disponible(uuid) to authenticated, service_role;
grant execute on function public.estimar_costo_ia(text, integer, integer) to authenticated, service_role;
grant execute on function public.ai_policy_de_org(uuid) to authenticated, service_role;
grant execute on function public.conciliar_presupuesto_ia(uuid, uuid, integer, integer, text) to service_role;
grant execute on function public.liberar_reserva_ia(uuid, uuid) to service_role;
