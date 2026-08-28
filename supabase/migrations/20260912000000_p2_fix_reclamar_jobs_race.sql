-- P2 — fix de carrera en `reclamar_jobs` (regresión de B1/B2,
-- 20260907000000).
--
-- El problema: la reescritura de B1/B2 movió el filtro de elegibilidad
-- (`estado in ('AUTHORIZED','RETRYING') ...`) al CTE `elegibles`, evaluado
-- una sola vez al principio. El `UPDATE ... WHERE id IN (seleccion) FOR
-- UPDATE SKIP LOCKED` final solo bloqueaba por id, sin re-verificar el
-- estado bajo el lock. Con varios workers concurrentes: A reclama el job X
-- y hace commit; B —cuya `seleccion` ya incluía X— toma el lock (ya
-- libre) y vuelve a poner X en RUNNING con `intentos+1`. Doble
-- procesamiento (visible como `intentos=2` en el test de 12 jobs / 3
-- workers).
--
-- El fix: la subconsulta con `FOR UPDATE SKIP LOCKED` vuelve a aplicar el
-- predicado de elegibilidad, igual que hacía la versión original de
-- 20260827001000. Un job que otro worker acaba de reclamar (ahora RUNNING
-- con lease vivo) queda excluido.
--
-- Rollback: restaurar 20260907000000.

create or replace function public.reclamar_jobs(
  p_worker_id text,
  p_limite int default 5
) returns setof public.jobs
language sql
security definer
set search_path = public
as $$
  with corriendo as (
    select organization_id, count(*)::int as n
      from public.jobs
     where estado = 'RUNNING' and lease_expires_at > now()
     group by organization_id
  ),
  elegibles as (
    select
      j.id,
      j.organization_id,
      j.prioridad,
      j.created_at,
      (j.estado = 'RUNNING') as es_reclamo_stale,
      row_number() over (
        partition by j.organization_id
        order by (j.estado = 'RUNNING') desc, j.prioridad asc, j.created_at asc
      ) as rango_org
    from public.jobs j
    where j.expires_at > now()
      and (
        (j.estado in ('AUTHORIZED', 'RETRYING')
          and (j.next_attempt_at is null or j.next_attempt_at <= now()))
        or (j.estado = 'RUNNING' and j.lease_expires_at < now())
      )
  ),
  con_cupo as (
    select e.*
      from elegibles e
      left join corriendo c on c.organization_id = e.organization_id
      left join public.ai_org_policy p on p.organization_id = e.organization_id
     where e.es_reclamo_stale
        or e.rango_org <= greatest(
             0,
             coalesce(p.max_concurrent_jobs, 3) - coalesce(c.n, 0)
           )
  ),
  seleccion as (
    select id
      from con_cupo
     order by rango_org asc, prioridad asc, created_at asc
     limit greatest(1, coalesce(p_limite, 5))
  )
  update public.jobs j
     set estado = 'RUNNING',
         intentos = j.intentos + 1,
         started_at = coalesce(j.started_at, now()),
         lease_expires_at = now() + interval '5 minutes',
         worker_id = p_worker_id
   where j.id in (
     -- Re-verifica el estado BAJO el row lock: un job que otro worker
     -- reclamó entre el cálculo de `seleccion` y aquí ya no cumple y se
     -- excluye (evita el doble reclamo).
     select j2.id
       from public.jobs j2
      where j2.id in (select id from seleccion)
        and j2.expires_at > now()
        and (
          (j2.estado in ('AUTHORIZED', 'RETRYING')
            and (j2.next_attempt_at is null or j2.next_attempt_at <= now()))
          or (j2.estado = 'RUNNING' and j2.lease_expires_at < now())
        )
      for update skip locked
   )
  returning j.*;
$$;

revoke all on function public.reclamar_jobs(text, int) from public, anon, authenticated;
grant execute on function public.reclamar_jobs(text, int) to service_role;
