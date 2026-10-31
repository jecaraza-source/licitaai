-- Aislamiento entre organizaciones: `presupuesto_ia_disponible(p_org)` es
-- SECURITY DEFINER y recibe el uuid de la organización sin validarlo. Con
-- `execute` para `authenticated`, cualquier usuario con sesión podía pasar el
-- uuid de otra organización y leer su cuota, sus límites y su gasto restante
-- (y, vía `ai_policy_de_org`, crearle una política por defecto). Mismo patrón
-- que se corrigió para `ai_policy_de_org` en 20261030000000.
--
-- A diferencia de aquella, esta sí está pensada para `authenticated` (dashboard
-- y pre-check de rutas), así que no se revoca: se exige que la organización
-- pedida sea la del llamante. Sin usuario en la sesión (service_role: tests,
-- jobs internos) no hay organización propia que comparar y se permite como
-- hasta ahora; `anon` ya no tiene execute (20260910000000_p2_b11_revoke_anon).
--
-- `create or replace` reemplaza también la configuración de la función, por eso
-- se repite el statement_timeout que puso 20260831000000_p2_f_rendimiento. Los
-- grants se conservan.
--
-- Rollback: volver a crear la función sin el bloque `if auth.uid() is not null`.

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
set statement_timeout = '5s'
as $$
declare
  v_pol public.ai_org_policy;
begin
  if auth.uid() is not null and p_org is distinct from public.user_org_id() then
    raise exception 'Solo puedes consultar el presupuesto de IA de tu organización'
      using errcode = '42501';
  end if;

  v_pol := public.ai_policy_de_org(p_org);
  return query select
    greatest(v_pol.cuota_mensual_usd - public._gasto_ia_ventana(p_org, date_trunc('month', now())), 0),
    greatest(v_pol.limite_diario_usd - public._gasto_ia_ventana(p_org, date_trunc('day', now())), 0),
    v_pol.cuota_mensual_usd,
    v_pol.limite_diario_usd,
    v_pol.limite_por_operacion_usd;
end;
$$;
