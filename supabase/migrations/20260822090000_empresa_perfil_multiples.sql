-- LicitaAI: soporte para múltiples empresas por organización
--
-- Antes, empresa_perfil tenía organization_id UNIQUE (una sola empresa por
-- organización). Ahora una organización puede dar de alta varias empresas
-- (p.ej. razones sociales distintas para licitar bajo diferentes marcas).
-- Cada usuario elige cuál tiene "activa" vía users.empresa_perfil_id — esa es
-- la que se muestra en el encabezado y la que se usa al generar propuestas,
-- auditorías y documentos exportados.

alter table public.empresa_perfil drop constraint empresa_perfil_organization_id_key;
create index empresa_perfil_organization_id_idx on public.empresa_perfil (organization_id);

alter table public.users
  add column empresa_perfil_id uuid references public.empresa_perfil (id) on delete set null;
