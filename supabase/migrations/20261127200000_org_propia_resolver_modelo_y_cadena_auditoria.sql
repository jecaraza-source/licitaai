-- Aislamiento entre organizaciones: `resolver_modelo_ia(p_org, ...)` y
-- `verificar_cadena_auditoria(p_org)` son SECURITY DEFINER, tienen `execute`
-- para `authenticated` y reciben el uuid de la organización sin validarlo.
-- Cualquier usuario con sesión podía pasar el uuid de otra organización y:
--   · resolver_modelo_ia: deducir la política de modelos y la allowlist de esa
--     organización (qué plan tiene);
--   · verificar_cadena_auditoria: saber cuántos eventos de auditoría tiene esa
--     organización y si su cadena está rota (y, con p_org = null, los eventos
--     de plataforma sin organización).
-- Mismo patrón que 20261031000000_presupuesto_ia_disponible_org_propia: si hay
-- usuario en la sesión, la organización pedida tiene que ser la suya. Además
-- se rechaza p_org nulo y un usuario sin perfil (user_org_id() nulo), para que
-- `null is distinct from null` no deje pasar a nadie.
--
-- No se revoca `execute` de `authenticated`: hoy nadie las llama con sesión de
-- usuario (los handlers Deno usan service_role y restore-verify/tests también),
-- pero el helper Node `src/lib/modelo-politica.ts` está pensado para una ruta
-- con el cliente del usuario y su propia organización, y eso sigue funcionando.
-- Sin usuario en la sesión (service_role: workers, restore-verify, tests) no hay
-- organización propia que comparar y se permite como hasta ahora.
--
-- `create or replace` conserva los grants. search_path ya estaba fijado; se
-- repite igual que en las migraciones originales (20260909000000 y
-- 20260901000000). Los cuerpos no cambian salvo el bloque de verificación.
--
-- Rollback: volver a crear ambas funciones sin el bloque
-- `if auth.uid() is not null ...` (definiciones en 20260909000000_p2_b4_politica_modelo
-- y 20260901000000_p2_i6_producto).

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
  if auth.uid() is not null
     and (p_org is null or p_org is distinct from public.user_org_id()) then
    raise exception 'Solo puedes consultar la política de modelos de tu organización'
      using errcode = '42501';
  end if;

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
    v_objetivo := case when p_confianza_baja then 'claude-sonnet-5' else 'claude-haiku-4-5' end;
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

-- ── verificar_cadena_auditoria ──────────────────────────────────────────
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
  if auth.uid() is not null
     and (p_org is null or p_org is distinct from public.user_org_id()) then
    raise exception 'Solo puedes verificar la cadena de auditoría de tu organización'
      using errcode = '42501';
  end if;

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
