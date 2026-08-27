-- Guarda el RFC / razón social que la IA detectó en el documento
-- corporativo y, cuando NO coincide con la empresa activa, el motivo
-- concreto — para poder mostrar en Configuración *por qué* no coincide
-- (antes solo se guardaba el booleano `coincide_empresa`).
--
-- Rollback:
--   alter table public.documentos_corporativos drop column if exists rfc_detectado;
--   alter table public.documentos_corporativos drop column if exists razon_social_detectada;
--   alter table public.documentos_corporativos drop column if exists motivo_no_coincide;

alter table public.documentos_corporativos
  add column if not exists rfc_detectado text;
alter table public.documentos_corporativos
  add column if not exists razon_social_detectada text;
alter table public.documentos_corporativos
  add column if not exists motivo_no_coincide text;

comment on column public.documentos_corporativos.motivo_no_coincide is
  'Explicación legible de por qué coincide_empresa = false (p. ej. "El RFC del documento (X) no coincide con el de tu empresa (Y)"). Null cuando coincide o cuando no hay datos para comparar.';
