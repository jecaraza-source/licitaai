-- P2 punch-list B4 (C4) — aplicar `modelos_permitidos` (allowlist) y
-- `politica_modelo` por organización.
--
-- Antes: las columnas existían en `ai_org_policy` pero nada las leía;
-- todos los handlers usaban `claude-sonnet-5` fijo.
--
-- Decisión de negocio (2026-08-28, aprobada por el usuario):
--   BASE       → Sonnet + Haiku + embeddings · politica `economico_por_defecto`
--                (económico = Sonnet; bajar a Haiku por defecto se evaluó y
--                 se rechazó por riesgo de calidad en extracción legal/técnica)
--   PRO        → + Opus · `avanzado_si_confianza_baja` (Sonnet→Opus si confianza baja)
--   ENTERPRISE → + Opus · `siempre_avanzado` (siempre Opus)
--
-- `resolver_modelo_ia(org, modelo_deseado, confianza_baja)` es la única
-- vía para elegir modelo: aplica la política y luego recorta a la
-- allowlist. La llaman los handlers (Node y Deno vía RPC) antes de invocar
-- al proveedor, y `crearJobConPresupuesto` para estimar el costo con el
-- modelo real.
--
-- Rollback:
--   drop function if exists public.resolver_modelo_ia(uuid, text, boolean);
--   -- y restaurar aplicar_plan_a_org de 20260901000000 (sin las 2 columnas nuevas).

-- ── aplicar_plan_a_org: ahora también fija modelos_permitidos + politica ──
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
  v_modelos text[];
  v_politica text;
begin
  if p_plan not in ('BASE', 'PRO', 'ENTERPRISE') then
    raise exception 'Plan inválido' using errcode = '22023';
  end if;

  select
    case p_plan when 'BASE' then 15 when 'PRO' then 60 else 300 end,
    case p_plan when 'BASE' then 2  when 'PRO' then 8  else 40 end,
    case p_plan when 'BASE' then 3::smallint when 'PRO' then 8::smallint else 20::smallint end
  into v_cuota, v_diario, v_concurrencia;

  v_modelos := case p_plan
    when 'BASE' then array['claude-sonnet-5', 'claude-haiku-4-5', 'text-embedding-3-small', 'text-embedding-3-small-mock']
    when 'PRO'  then array['claude-sonnet-5', 'claude-haiku-4-5', 'claude-opus-5', 'text-embedding-3-small', 'text-embedding-3-small-mock']
    else array['claude-sonnet-5', 'claude-haiku-4-5', 'claude-opus-5', 'text-embedding-3-small', 'text-embedding-3-small-mock']
  end;
  v_politica := case p_plan
    when 'BASE'       then 'economico_por_defecto'
    when 'PRO'        then 'avanzado_si_confianza_baja'
    else                  'siempre_avanzado'
  end;

  update public.organizations set plan = p_plan where id = p_org;

  insert into public.ai_org_policy (
    organization_id, cuota_mensual_usd, limite_diario_usd, max_concurrent_jobs,
    modelos_permitidos, politica_modelo
  )
  values (p_org, v_cuota, v_diario, v_concurrencia, v_modelos, v_politica)
  on conflict (organization_id) do update
    set cuota_mensual_usd = excluded.cuota_mensual_usd,
        limite_diario_usd = excluded.limite_diario_usd,
        max_concurrent_jobs = excluded.max_concurrent_jobs,
        modelos_permitidos = excluded.modelos_permitidos,
        politica_modelo = excluded.politica_modelo;
end;
$$;
revoke all on function public.aplicar_plan_a_org(uuid, text) from public, anon, authenticated;
grant execute on function public.aplicar_plan_a_org(uuid, text) to service_role;

-- ── resolver_modelo_ia ──────────────────────────────────────────────────
create or replace function public.resolver_modelo_ia(
  p_org uuid,
  p_modelo_deseado text,
  p_confianza_baja boolean default false
) returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  -- Tiers de modelos de chat, de barato a caro.
  v_tiers text[] := array['claude-haiku-4-5', 'claude-sonnet-5', 'claude-opus-5'];
  v_permitidos text[];
  v_politica text;
  v_objetivo text;
  v_idx int;
  m text;
begin
  select modelos_permitidos, politica_modelo
    into v_permitidos, v_politica
  from public.ai_org_policy where organization_id = p_org;

  -- Sin fila de política: defaults (todo permitido, económico).
  if v_permitidos is null then
    v_permitidos := array['claude-haiku-4-5', 'claude-sonnet-5', 'claude-opus-5', 'text-embedding-3-small', 'text-embedding-3-small-mock'];
    v_politica := 'economico_por_defecto';
  end if;

  -- Embeddings: familia aparte, no se les aplica la política de chat.
  if p_modelo_deseado like 'text-embedding%' then
    if p_modelo_deseado = any(v_permitidos) then return p_modelo_deseado; end if;
    return 'text-embedding-3-small';
  end if;

  -- Modelo de chat: determinar el objetivo según la política.
  if v_politica = 'siempre_avanzado' then
    v_objetivo := 'claude-opus-5';
  elsif v_politica = 'economico_por_defecto' then
    -- "Económico" YA es Sonnet: es el piso de calidad para extracción
    -- legal/técnica. No se baja a Haiku por defecto ni se escala desde él.
    v_objetivo := 'claude-sonnet-5';
  else -- avanzado_si_confianza_baja
    v_idx := array_position(v_tiers, p_modelo_deseado);
    if v_idx is null then v_idx := 2; end if; -- desconocido -> sonnet
    if p_confianza_baja then v_idx := least(v_idx + 1, array_length(v_tiers, 1)); end if;
    v_objetivo := v_tiers[v_idx];
  end if;

  -- Recorte a la allowlist: si el objetivo no está permitido, bajar por
  -- tiers hasta el mejor permitido.
  if v_objetivo = any(v_permitidos) then return v_objetivo; end if;

  v_idx := array_position(v_tiers, v_objetivo);
  if v_idx is null then v_idx := array_length(v_tiers, 1); end if;
  for i in reverse v_idx..1 loop
    m := v_tiers[i];
    if m = any(v_permitidos) then return m; end if;
  end loop;
  -- Nada de chat permitido (no debería pasar) — probar hacia arriba.
  foreach m in array v_tiers loop
    if m = any(v_permitidos) then return m; end if;
  end loop;

  return p_modelo_deseado; -- último recurso
end;
$$;

revoke all on function public.resolver_modelo_ia(uuid, text, boolean) from public, anon;
grant execute on function public.resolver_modelo_ia(uuid, text, boolean) to authenticated, service_role;

comment on function public.resolver_modelo_ia(uuid, text, boolean) is
  'P2·B4 — dado el modelo que un handler querría usar, devuelve el modelo REAL a usar tras aplicar politica_modelo y modelos_permitidos de la organización.';

-- Flag: mientras esté OFF, los handlers siguen usando su modelo fijo
-- (claude-sonnet-5). Al activarlo, aplican `resolver_modelo_ia` — que con
-- `economico_por_defecto` mantiene Sonnet, y sube a Opus en PRO/ENTERPRISE
-- según su política.
insert into public.feature_flags (key, descripcion) values
  ('ai.politica_modelo', 'P2.2 C4 — los handlers de IA aplican politica_modelo + modelos_permitidos por organización')
on conflict (key) do nothing;
