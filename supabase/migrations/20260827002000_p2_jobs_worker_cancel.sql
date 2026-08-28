-- P2 · A2 — soporte del worker para la cancelación cooperativa.
--
-- cancelar_job() (authenticated) marca cancel_solicitada=true en un job
-- RUNNING; el worker lo detecta en el siguiente checkpoint y necesita una
-- vía (con service_role) para cerrarlo en CANCELLED sin pasar por la
-- verificación de user_org_id() de cancelar_job().
--
-- Rollback: drop function if exists public.marcar_job_cancelado(uuid);

create or replace function public.marcar_job_cancelado(p_job_id uuid)
returns public.jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.jobs;
begin
  update public.jobs
     set estado = 'CANCELLED', finished_at = now(), lease_expires_at = null
   where id = p_job_id
     and estado in ('RUNNING', 'AUTHORIZED', 'RETRYING')
   returning * into v_job;
  return v_job;
end;
$$;

revoke all on function public.marcar_job_cancelado(uuid) from public;
grant execute on function public.marcar_job_cancelado(uuid) to service_role;
