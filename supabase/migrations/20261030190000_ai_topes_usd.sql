-- Consola de IA — topes de gasto en USD para las llamadas directas.
--
-- Hasta ahora los topes en USD de ai_org_policy (cuota_mensual_usd,
-- limite_diario_usd) solo se aplicaban en la ruta de jobs asíncronos
-- (reservar_presupuesto_ia), que está apagada: las llamadas directas a IA solo
-- pasaban por check_ai_budget, un tope diario de TOKENS. Esta migración hace
-- que check_ai_budget —el único punto por el que pasan las rutas de Next y las
-- Edge Functions— también compare el gasto en USD del día y del mes contra la
-- política de la organización.
--
-- Es opt-in por organización: topes_usd_activos nace en false, así que aplicar
-- la migración no cambia el comportamiento de nadie. Lo activa un admin de
-- plataforma desde Configuración (PATCH /api/admin/ia-topes).
--
-- Cálculo: ai_usage_log (tokens por modelo) × ai_model_pricing. Un modelo sin
-- precio se cobra al precio más alto del catálogo (se sobreestima, nunca se
-- subestima). Día y mes se miden en hora de Ciudad de México.
--
-- Límite conocido: el uso se registra DESPUÉS de cada llamada, así que la
-- operación que cruza el tope se completa; las siguientes se bloquean.
--
-- Rollback:
--   alter table public.ai_org_policy drop column topes_usd_activos;
--   drop function public.ai_estado_consumo();
--   drop function public._gasto_ia_uso_log(uuid, timestamptz);
--   -- y volver a la definición anterior de check_ai_budget (solo tokens).

alter table public.ai_org_policy
  add column if not exists topes_usd_activos boolean not null default false;

comment on column public.ai_org_policy.topes_usd_activos is
  'Si es true, check_ai_budget bloquea las llamadas de IA de la organización al alcanzar limite_diario_usd o cuota_mensual_usd (hora de Ciudad de México).';

-- Gasto en USD de una organización desde p_desde, según ai_usage_log.
create or replace function public._gasto_ia_uso_log(p_org uuid, p_desde timestamptz)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(
    (u.input_tokens * coalesce(p.input_usd_por_1m, m.max_in)
     + u.output_tokens * coalesce(p.output_usd_por_1m, m.max_out)) / 1000000.0
  ), 0)::numeric
  from public.ai_usage_log u
  left join public.ai_model_pricing p on p.modelo = u.modelo
  cross join (
    select coalesce(max(input_usd_por_1m), 0) as max_in,
           coalesce(max(output_usd_por_1m), 0) as max_out
      from public.ai_model_pricing
  ) m
  where u.organization_id = p_org
    and u.created_at >= p_desde;
$$;

revoke execute on function public._gasto_ia_uso_log(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public._gasto_ia_uso_log(uuid, timestamptz) to service_role;

-- Tope diario de tokens (comportamiento previo) + topes en USD si la
-- organización los tiene activos. Misma firma y mismos grants que antes.
create or replace function public.check_ai_budget(p_limite_diario bigint default 3000000)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_total bigint;
  v_org uuid;
  v_pol record;
  v_inicio_dia timestamptz;
  v_inicio_mes timestamptz;
begin
  if auth.uid() is null then
    return false;
  end if;

  v_org := public.user_org_id();

  select coalesce(sum(input_tokens + output_tokens), 0)
    into v_total
    from public.ai_usage_log
   where organization_id = v_org
     and created_at >= date_trunc('day', now());

  if v_total >= p_limite_diario then
    return false;
  end if;

  select cuota_mensual_usd, limite_diario_usd
    into v_pol
    from public.ai_org_policy
   where organization_id = v_org
     and topes_usd_activos;

  if found then
    v_inicio_dia := date_trunc('day', now() at time zone 'America/Mexico_City') at time zone 'America/Mexico_City';
    v_inicio_mes := date_trunc('month', now() at time zone 'America/Mexico_City') at time zone 'America/Mexico_City';

    if public._gasto_ia_uso_log(v_org, v_inicio_dia) >= v_pol.limite_diario_usd then
      return false;
    end if;
    if public._gasto_ia_uso_log(v_org, v_inicio_mes) >= v_pol.cuota_mensual_usd then
      return false;
    end if;
  end if;

  return true;
end;
$function$;

-- Estado de consumo de la organización del llamante, para la consola de
-- Configuración. Solo lectura; la organización sale de auth.uid().
create or replace function public.ai_estado_consumo()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_pol public.ai_org_policy;
  v_inicio_dia timestamptz;
  v_inicio_mes timestamptz;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  v_org := public.user_org_id();
  select * into v_pol from public.ai_org_policy where organization_id = v_org;
  if not found then
    -- Sin fila de política: valores por defecto de la tabla, sin crearla.
    v_pol.cuota_mensual_usd := 60;
    v_pol.limite_diario_usd := 10;
    v_pol.alertas_umbral_pct := array[50, 80, 95];
    v_pol.topes_usd_activos := false;
  end if;

  v_inicio_dia := date_trunc('day', now() at time zone 'America/Mexico_City') at time zone 'America/Mexico_City';
  v_inicio_mes := date_trunc('month', now() at time zone 'America/Mexico_City') at time zone 'America/Mexico_City';

  return jsonb_build_object(
    'organization_id', v_org,
    'gasto_hoy_usd', round(public._gasto_ia_uso_log(v_org, v_inicio_dia), 4),
    'gasto_mes_usd', round(public._gasto_ia_uso_log(v_org, v_inicio_mes), 4),
    'limite_diario_usd', v_pol.limite_diario_usd,
    'cuota_mensual_usd', v_pol.cuota_mensual_usd,
    'alertas_umbral_pct', v_pol.alertas_umbral_pct,
    'topes_usd_activos', v_pol.topes_usd_activos
  );
end;
$$;

revoke execute on function public.ai_estado_consumo() from public, anon;
grant execute on function public.ai_estado_consumo() to authenticated, service_role;
