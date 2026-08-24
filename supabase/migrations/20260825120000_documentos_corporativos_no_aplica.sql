-- LicitaAI: permite marcar un tipo de documento corporativo como "no aplica"
-- (ej. una empresa persona física sin socios/accionistas), para que el
-- checklist de documentos requeridos no se quede en rojo indefinidamente.

alter table public.empresa_perfil
  add column documentos_no_aplican jsonb not null default '[]'::jsonb;

comment on column public.empresa_perfil.documentos_no_aplican is
  'Lista de "tipo" de documentos corporativos marcados como no aplicables a esta empresa.';
