-- LicitaAI: jerarquía de autorización del staff (Ejecutor → Integrador →
-- Supervisor) y alta de staff por invitación.
--
-- 1) users.rol_jerarquico: rango del usuario dentro de la cadena de mando.
-- 2) invitaciones_staff: invitaciones por correo para sumar gente a la
--    organización (hoy solo se puede crear cuenta creando una organización
--    nueva vía /register).
-- 3) licitacion_jerarquia: quién ocupa cada rol para un procedimiento
--    específico y el timestamp de autorización de cada nivel. El envío
--    (ENVIADA) queda bloqueado sin la autorización del Supervisor.

-- ============================================================================
-- 1) users.rol_jerarquico
-- ============================================================================

alter table public.users
  add column rol_jerarquico text check (rol_jerarquico in ('EJECUTOR', 'INTEGRADOR', 'SUPERVISOR'));

comment on column public.users.rol_jerarquico is
  'Rango en la cadena de autorización de licitaciones. Independiente de "rol" (permisos de lectura/escritura).';

-- El trigger de alta de usuario debe propagar rol_jerarquico si viene en los
-- metadatos del signup (registro directo o aceptación de invitación).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, organization_id, email, nombre, rol, rol_jerarquico)
  values (
    new.id,
    (new.raw_user_meta_data ->> 'organization_id')::uuid,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'nombre', new.email),
    coalesce(new.raw_user_meta_data ->> 'rol', 'ADMIN'),
    new.raw_user_meta_data ->> 'rol_jerarquico'
  );
  return new;
end;
$$;

-- ============================================================================
-- 2) invitaciones_staff
-- ============================================================================

create table public.invitaciones_staff (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null,
  rol_jerarquico text not null check (rol_jerarquico in ('EJECUTOR', 'INTEGRADOR', 'SUPERVISOR')),
  token uuid not null default gen_random_uuid() unique,
  invitado_por uuid references public.users (id) on delete set null,
  aceptada_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days')
);

create index invitaciones_staff_organization_id_idx on public.invitaciones_staff (organization_id);

alter table public.invitaciones_staff enable row level security;

create policy "invitaciones_staff_select_own_org" on public.invitaciones_staff
  for select using (organization_id = public.user_org_id());

create policy "invitaciones_staff_insert_admin" on public.invitaciones_staff
  for insert with check (organization_id = public.user_org_id() and public.user_rol() = 'ADMIN');

create policy "invitaciones_staff_delete_admin" on public.invitaciones_staff
  for delete using (organization_id = public.user_org_id() and public.user_rol() = 'ADMIN');

-- Lectura pública (sin sesión) de los datos no sensibles de una invitación,
-- para poder mostrar "Te invitaron a unirte a <empresa> como <rol>" antes de
-- que la persona tenga cuenta.
create or replace function public.invitacion_info(p_token uuid)
returns table (
  organizacion_id uuid,
  organizacion_nombre text,
  email text,
  rol_jerarquico text,
  valido boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    o.id,
    o.nombre,
    i.email,
    i.rol_jerarquico,
    (i.aceptada_at is null and i.expires_at > now()) as valido
  from public.invitaciones_staff i
  join public.organizations o on o.id = i.organization_id
  where i.token = p_token;
$$;

grant execute on function public.invitacion_info(uuid) to anon, authenticated;

-- Marca la invitación como aceptada. Se llama ya autenticado, justo después
-- de que el trigger handle_new_user() insertó la fila en public.users con la
-- organización/rol de la invitación.
create or replace function public.aceptar_invitacion_staff(p_token uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.invitaciones_staff%rowtype;
  v_email text;
begin
  select email into v_email from public.users where id = auth.uid();
  select * into v_invite from public.invitaciones_staff where token = p_token;

  if v_invite.id is null then
    raise exception 'Invitación no encontrada';
  end if;
  if v_invite.aceptada_at is not null then
    raise exception 'Invitación ya utilizada';
  end if;
  if v_invite.expires_at < now() then
    raise exception 'Invitación expirada';
  end if;
  if v_email is distinct from v_invite.email then
    raise exception 'Esta invitación no corresponde a tu cuenta';
  end if;

  update public.invitaciones_staff set aceptada_at = now() where token = p_token;
end;
$$;

grant execute on function public.aceptar_invitacion_staff(uuid) to authenticated;

-- ============================================================================
-- 3) licitacion_jerarquia
-- ============================================================================

create table public.licitacion_jerarquia (
  id uuid primary key default gen_random_uuid(),
  licitacion_id uuid not null unique references public.licitaciones (id) on delete cascade,
  ejecutor_id uuid references public.users (id) on delete set null,
  integrador_id uuid references public.users (id) on delete set null,
  supervisor_id uuid references public.users (id) on delete set null,
  ejecutor_autorizado_at timestamptz,
  integrador_autorizado_at timestamptz,
  supervisor_autorizado_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.licitacion_jerarquia enable row level security;

create policy "licitacion_jerarquia_select_own_org" on public.licitacion_jerarquia
  for select using (public.licitacion_org_matches(licitacion_id));

create policy "licitacion_jerarquia_insert_own_org" on public.licitacion_jerarquia
  for insert with check (public.licitacion_org_matches(licitacion_id) and public.is_write_role());

create policy "licitacion_jerarquia_update_own_org" on public.licitacion_jerarquia
  for update using (public.licitacion_org_matches(licitacion_id) and public.is_write_role());

create trigger licitacion_jerarquia_set_updated_at
  before update on public.licitacion_jerarquia
  for each row
  execute function public.set_updated_at();

comment on table public.licitacion_jerarquia is
  'Cadena de autorización Ejecutor → Integrador → Supervisor para un procedimiento. El envío (ENVIADA) requiere supervisor_autorizado_at.';
