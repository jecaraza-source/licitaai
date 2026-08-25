-- LicitaAI: permite marcar un tipo de documento de la convocante como
-- "no aplica" para una licitación específica (además del filtro automático
-- por modalidad_procedimiento), igual que ya existe para documentos
-- corporativos en empresa_perfil.documentos_no_aplican.

alter table public.licitaciones
  add column documentos_convocante_no_aplica jsonb not null default '[]'::jsonb;

comment on column public.licitaciones.documentos_convocante_no_aplica is
  'Lista de "tipo" de documentos de la convocante marcados como no aplicables a esta licitación.';
