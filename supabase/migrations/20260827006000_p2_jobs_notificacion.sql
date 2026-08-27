-- P2 · A6 — notificación por email de jobs largos (ADR 0003).
--
-- El worker envía un correo al solicitante cuando un job que tardó > 60s
-- llega a COMPLETED / FAILED / EXPIRED. `notificado_at` + marcar_job_notificado()
-- garantizan que se manda una sola vez aunque el paso de notificación se
-- reintente o dos workers procesen la misma transición.
--
-- Rollback:
--   drop function if exists public.marcar_job_notificado(uuid);
--   alter table public.jobs drop column if exists notificado_at;

alter table public.jobs add column if not exists notificado_at timestamptz;

create or replace function public.marcar_job_notificado(p_job_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok boolean;
begin
  update public.jobs
     set notificado_at = now()
   where id = p_job_id and notificado_at is null
   returning true into v_ok;
  return coalesce(v_ok, false);
end;
$$;

revoke all on function public.marcar_job_notificado(uuid) from public;
grant execute on function public.marcar_job_notificado(uuid) to service_role;
