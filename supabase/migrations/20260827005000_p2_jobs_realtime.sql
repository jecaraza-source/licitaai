-- P2 · A5 — Realtime sobre public.jobs (ADR 0003).
--
-- <JobStatus> se suscribe a postgres_changes de la fila del job para
-- mostrar progreso en vivo. La política jobs_select_own_org (migración
-- 20260827001000) ya acota lo que cada cliente puede ver, así que Realtime
-- solo entrega a un usuario los cambios de los jobs de su organización.
--
-- El worker actualiza `progreso` solo en checkpoints con salto >= 5% para
-- no saturar este canal (ver _shared/job-runner.ts / handlers).
--
-- Rollback: alter publication supabase_realtime drop table public.jobs;

alter publication supabase_realtime add table public.jobs;

-- Helper de observabilidad/tests: ¿la tabla está en la publicación de
-- Realtime? (pg_publication_tables no se expone vía PostgREST).
create or replace function public.tabla_en_realtime(p_tabla text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = p_tabla
  );
$$;

revoke all on function public.tabla_en_realtime(text) from public;
grant execute on function public.tabla_en_realtime(text) to service_role;
