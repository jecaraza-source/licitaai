-- P2 · Fase B — añade el tipo de job "noop-ef" (prueba del wrapper
-- invocar-ef, análogo a "noop" para el runner directo).
--
-- Rollback: restaurar el CHECK sin 'noop-ef' (ver migración 20260827001000).

alter table public.jobs drop constraint jobs_tipo_check;
alter table public.jobs add constraint jobs_tipo_check check (tipo in (
  'noop', 'noop-ef',
  'procesar-documento', 'analizar-bases', 'generar-estudio-mercado',
  'generar-preguntas-junta', 'generar-propuesta-tecnica',
  'auditar-documento', 'auditar-expediente', 'seguimiento-analizar-fallo',
  'analizar-documento-corporativo', 'procesar-referencia-legal'
));
