-- LicitaAI — Sprint 1: Row Level Security multi-tenant

-- ============================================================================
-- Helper functions (security definer, evitan recursión de RLS en public.users)
-- ============================================================================
create or replace function public.user_org_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select organization_id from public.users where id = auth.uid();
$$;

create or replace function public.user_rol()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select rol from public.users where id = auth.uid();
$$;

create or replace function public.is_write_role()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(public.user_rol() in ('ADMIN', 'MANAGER', 'ANALYST'), false);
$$;

create or replace function public.licitacion_org_matches(p_licitacion_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.licitaciones l
    where l.id = p_licitacion_id
      and l.organization_id = public.user_org_id()
  );
$$;

-- ============================================================================
-- ORGANIZATIONS
-- ============================================================================
alter table public.organizations enable row level security;

create policy "organizations_select_own" on public.organizations
  for select using (id = public.user_org_id());

create policy "organizations_update_admin" on public.organizations
  for update using (id = public.user_org_id() and public.user_rol() = 'ADMIN');

-- Insert de nuevas organizaciones ocurre sin sesión (registro); se permite a
-- cualquier usuario autenticado o anónimo crear una org durante el signup.
create policy "organizations_insert_signup" on public.organizations
  for insert with check (true);

-- ============================================================================
-- USERS
-- ============================================================================
alter table public.users enable row level security;

create policy "users_select_same_org" on public.users
  for select using (organization_id = public.user_org_id());

create policy "users_update_self_or_admin" on public.users
  for update using (
    id = auth.uid()
    or (organization_id = public.user_org_id() and public.user_rol() = 'ADMIN')
  );

create policy "users_delete_admin" on public.users
  for delete using (organization_id = public.user_org_id() and public.user_rol() = 'ADMIN');

-- El insert real ocurre vía trigger handle_new_user() (security definer),
-- pero se deja una policy explícita por si se inserta directamente como ADMIN.
create policy "users_insert_admin" on public.users
  for insert with check (
    organization_id = public.user_org_id() and public.user_rol() = 'ADMIN'
  );

-- ============================================================================
-- LICITACIONES
-- ============================================================================
alter table public.licitaciones enable row level security;

create policy "licitaciones_select_own_org" on public.licitaciones
  for select using (organization_id = public.user_org_id());

create policy "licitaciones_write_own_org" on public.licitaciones
  for insert with check (organization_id = public.user_org_id() and public.is_write_role());

create policy "licitaciones_update_own_org" on public.licitaciones
  for update using (organization_id = public.user_org_id() and public.is_write_role());

create policy "licitaciones_delete_admin" on public.licitaciones
  for delete using (organization_id = public.user_org_id() and public.user_rol() = 'ADMIN');

-- ============================================================================
-- Tablas hijas de licitaciones (acceso vía licitacion_id)
-- ============================================================================
do $$
declare
  t text;
  child_tables text[] := array[
    'documentos', 'partidas', 'propuestas', 'checklist_items', 'analisis_bases',
    'propuesta_economica_partidas', 'propuesta_economica_config', 'estudio_mercado',
    'junta_aclaraciones', 'actividad_log'
  ];
begin
  foreach t in array child_tables loop
    execute format('alter table public.%I enable row level security', t);

    execute format(
      'create policy "%1$s_select_own_org" on public.%1$s
         for select using (public.licitacion_org_matches(licitacion_id))',
      t
    );

    execute format(
      'create policy "%1$s_insert_own_org" on public.%1$s
         for insert with check (public.licitacion_org_matches(licitacion_id) and public.is_write_role())',
      t
    );

    execute format(
      'create policy "%1$s_update_own_org" on public.%1$s
         for update using (public.licitacion_org_matches(licitacion_id) and public.is_write_role())',
      t
    );

    execute format(
      'create policy "%1$s_delete_own_org" on public.%1$s
         for delete using (public.licitacion_org_matches(licitacion_id) and public.is_write_role())',
      t
    );
  end loop;
end $$;

-- ============================================================================
-- DOCUMENT CHUNKS (acceso vía documento_id -> licitacion_id)
-- ============================================================================
alter table public.document_chunks enable row level security;

create policy "document_chunks_select_own_org" on public.document_chunks
  for select using (
    exists (
      select 1 from public.documentos d
      where d.id = document_chunks.documento_id
        and public.licitacion_org_matches(d.licitacion_id)
    )
  );

create policy "document_chunks_insert_own_org" on public.document_chunks
  for insert with check (
    exists (
      select 1 from public.documentos d
      where d.id = document_chunks.documento_id
        and public.licitacion_org_matches(d.licitacion_id)
    )
  );

create policy "document_chunks_delete_own_org" on public.document_chunks
  for delete using (
    exists (
      select 1 from public.documentos d
      where d.id = document_chunks.documento_id
        and public.licitacion_org_matches(d.licitacion_id)
    )
  );

-- ============================================================================
-- EMPRESA PERFIL
-- ============================================================================
alter table public.empresa_perfil enable row level security;

create policy "empresa_perfil_select_own_org" on public.empresa_perfil
  for select using (organization_id = public.user_org_id());

create policy "empresa_perfil_write_own_org" on public.empresa_perfil
  for insert with check (organization_id = public.user_org_id() and public.is_write_role());

create policy "empresa_perfil_update_own_org" on public.empresa_perfil
  for update using (organization_id = public.user_org_id() and public.is_write_role());

-- ============================================================================
-- ESTADOS CONFIG (catálogo global de solo lectura para cualquier usuario autenticado)
-- ============================================================================
alter table public.estados_config enable row level security;

create policy "estados_config_select_authenticated" on public.estados_config
  for select using (auth.role() = 'authenticated');
