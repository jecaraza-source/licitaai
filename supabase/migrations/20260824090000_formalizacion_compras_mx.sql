-- LicitaAI: formaliza procesos que ya funcionan (proceso operativo Compras MX)
--
-- 1) Clasificación de formatos A/B/C/D (Paso 6).
-- 2) Segundo revisor obligatorio en el doble check (Paso 17).
-- 3) Bandera de Investigación de Mercado, para el checklist de intake propio (§24).
-- 4) Modelo de responsabilidades internas por procedimiento (§27).
-- 5) Bóveda de documentos corporativos permanentes por empresa (Paso 10).
-- 6) Campos de formalización contractual tras adjudicación (Paso 21).

-- ============================================================================
-- 1) Clasificación de formatos
-- ============================================================================

alter table public.checklist_items
  add column tipo_formato text check (tipo_formato = any (array['A', 'B', 'C', 'D']));

comment on column public.checklist_items.tipo_formato is
  'A = obligatorio sin modificaciones, B = formato modelo, C = escrito libre con texto obligatorio, D = documento emitido por tercero (Paso 6).';

-- ============================================================================
-- 2) Segundo revisor obligatorio
-- ============================================================================

alter table public.propuestas
  add column revisor_id uuid references public.users (id) on delete set null,
  add column revisado_at timestamptz;

comment on column public.propuestas.revisor_id is
  'Quien elaboró la propuesta no debería ser quien la valida (Paso 17). Debe ser distinto de created_by.';

-- ============================================================================
-- 3) Investigación de Mercado
-- ============================================================================

alter table public.licitaciones
  add column es_investigacion_mercado boolean not null default false;

-- ============================================================================
-- 4) Modelo de responsabilidades internas
-- ============================================================================

create table public.responsabilidades_procedimiento (
  id uuid primary key default gen_random_uuid(),
  licitacion_id uuid not null unique references public.licitaciones (id) on delete cascade,
  asignaciones_json jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.responsabilidades_procedimiento enable row level security;

create policy "responsabilidades_select_own_org" on public.responsabilidades_procedimiento
  for select using (public.licitacion_org_matches(licitacion_id));

create policy "responsabilidades_write_own_org" on public.responsabilidades_procedimiento
  for insert with check (public.licitacion_org_matches(licitacion_id) and public.is_write_role());

create policy "responsabilidades_update_own_org" on public.responsabilidades_procedimiento
  for update using (public.licitacion_org_matches(licitacion_id) and public.is_write_role());

create trigger responsabilidades_set_updated_at
  before update on public.responsabilidades_procedimiento
  for each row
  execute function public.set_updated_at();

-- ============================================================================
-- 5) Bóveda de documentos corporativos permanentes
-- ============================================================================

create table public.documentos_corporativos (
  id uuid primary key default gen_random_uuid(),
  empresa_perfil_id uuid not null references public.empresa_perfil (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  tipo text not null,
  nombre text not null,
  storage_path text not null,
  vigencia_hasta date,
  created_at timestamptz not null default now()
);

create index documentos_corporativos_empresa_idx on public.documentos_corporativos (empresa_perfil_id);

alter table public.documentos_corporativos enable row level security;

create policy "documentos_corporativos_select_own_org" on public.documentos_corporativos
  for select using (organization_id = public.user_org_id());

create policy "documentos_corporativos_insert_own_org" on public.documentos_corporativos
  for insert with check (organization_id = public.user_org_id() and public.is_write_role());

create policy "documentos_corporativos_delete_own_org" on public.documentos_corporativos
  for delete using (organization_id = public.user_org_id() and public.is_write_role());

insert into storage.buckets (id, name, public, file_size_limit)
values ('documentos-corporativos', 'documentos-corporativos', false, 20971520)
on conflict (id) do nothing;

create policy "documentos_corporativos_bucket_select_own_org" on storage.objects
  for select using (
    bucket_id = 'documentos-corporativos'
    and (storage.foldername(name))[1] = public.user_org_id()::text
  );

create policy "documentos_corporativos_bucket_insert_own_org" on storage.objects
  for insert with check (
    bucket_id = 'documentos-corporativos'
    and (storage.foldername(name))[1] = public.user_org_id()::text
    and public.is_write_role()
  );

create policy "documentos_corporativos_bucket_delete_own_org" on storage.objects
  for delete using (
    bucket_id = 'documentos-corporativos'
    and (storage.foldername(name))[1] = public.user_org_id()::text
    and public.is_write_role()
  );

-- ============================================================================
-- 6) Formalización contractual tras adjudicación
-- ============================================================================

alter table public.seguimiento
  add column contrato_documento_id uuid references public.documentos (id) on delete set null,
  add column garantia_documento_id uuid references public.documentos (id) on delete set null,
  add column fianza_documento_id uuid references public.documentos (id) on delete set null,
  add column vigencia_inicio date,
  add column vigencia_fin date,
  add column administrador_contrato_id uuid references public.users (id) on delete set null,
  add column orden_suministro text,
  add column lugar_entrega text,
  add column penalizaciones text,
  add column niveles_servicio text;
