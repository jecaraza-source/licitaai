-- P2 · B4 — Política de modelo por plan (docs/p2/16-pendientes.md fila B4).
-- Hasta ahora aplicar_plan_a_org solo fijaba cuota/límite diario/concurrencia;
-- modelos_permitidos y politica_modelo se quedaban en el default de la
-- columna para todas las organizaciones sin importar el plan. Aprobado
-- explícitamente (ver hilo de decisión), la tabla queda así:
--
--   Plan        modelos_permitidos                                    politica_modelo
--   BASE        sonnet, haiku, embeddings                             economico_por_defecto
--   PRO         + opus                                                avanzado_si_confianza_baja
--   ENTERPRISE  + opus                                                siempre_avanzado
--
-- Decisión de negocio explícita: "económico" nunca baja a Haiku por
-- defecto en ningún plan — Sonnet sigue siendo el piso de calidad ya
-- validado para este dominio (extracción legal/técnica de licitaciones,
-- donde un error puede costarle al cliente un contrato). Haiku queda en el
-- allowlist pero sin usarse por defecto hasta medir su precisión aquí.

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
    case p_plan when 'BASE' then 3::smallint when 'PRO' then 8::smallint else 20::smallint end,
    case p_plan
      when 'BASE' then array['claude-sonnet-5', 'claude-haiku-4-5', 'text-embedding-3-small']
      else array['claude-sonnet-5', 'claude-haiku-4-5', 'claude-opus-5', 'text-embedding-3-small']
    end,
    case p_plan
      when 'BASE' then 'economico_por_defecto'
      when 'PRO' then 'avanzado_si_confianza_baja'
      else 'siempre_avanzado'
    end
  into v_cuota, v_diario, v_concurrencia, v_modelos, v_politica;

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

-- Backfill: aplica la política de modelo a las organizaciones que ya tienen
-- un plan asignado, para que el cambio no quede solo para altas futuras.
do $$
declare
  r record;
begin
  for r in select id, plan from public.organizations loop
    perform public.aplicar_plan_a_org(r.id, r.plan);
  end loop;
end $$;
