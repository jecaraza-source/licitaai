-- P2 · A4 — flag para la API genérica de jobs.
--
-- POST /api/jobs (crear_job) queda detrás de este flag: mientras el worker
-- solo tiene el handler "noop" (Fase B añade los de dominio), no se expone
-- la creación de jobs de tipos que aún no tienen quién los ejecute. Los
-- tests lo activan con FLAG_JOBS_API=on.
--
-- Rollback: delete from public.feature_flags where key = 'jobs.api';

insert into public.feature_flags (key, descripcion) values
  ('jobs.api', 'P2.1 A4 — API genérica POST /api/jobs para crear jobs asíncronos')
on conflict (key) do nothing;
