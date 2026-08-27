-- P2 · B1 — registro de uso de IA desde el worker (service_role).
--
-- registrar_uso_ia() (P0.6) es SECURITY DEFINER keyed por auth.uid(), así
-- que no sirve para el worker (que corre con service_role, sin JWT de
-- usuario). Esta función toma la organización y el usuario explícitos (el
-- worker los tiene en el job: organization_id / requested_by).
--
-- El gobierno de costo completo (reserva -> conciliación, ai_budget_ledger)
-- llega en la Fase C y sustituye/complementa esto; por ahora solo alimenta
-- ai_usage_log para que check_ai_budget siga contabilizando el gasto de las
-- operaciones migradas a jobs.
--
-- Rollback: drop function if exists public.registrar_uso_ia_worker(uuid,uuid,text,text,integer,integer);

create or replace function public.registrar_uso_ia_worker(
  p_organization_id uuid,
  p_user_id uuid,
  p_funcion text,
  p_modelo text,
  p_input_tokens integer,
  p_output_tokens integer
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.ai_usage_log (organization_id, user_id, funcion, modelo, input_tokens, output_tokens)
  values (
    p_organization_id,
    p_user_id,
    p_funcion,
    p_modelo,
    greatest(coalesce(p_input_tokens, 0), 0),
    greatest(coalesce(p_output_tokens, 0), 0)
  );
end;
$$;

revoke all on function public.registrar_uso_ia_worker(uuid, uuid, text, text, integer, integer) from public;
grant execute on function public.registrar_uso_ia_worker(uuid, uuid, text, text, integer, integer) to service_role;
