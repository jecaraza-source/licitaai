-- LicitaAI — administradores/operadores de la plataforma (equipo LicitaAI,
-- no de una organización cliente). Reemplaza el mecanismo anterior
-- (PLATFORM_ADMIN_EMAILS, una allowlist por variable de entorno sin tabla)
-- por cuentas reales con Supabase Auth (correo + contraseña) y dos roles:
-- ADMIN (gestiona otros admins/operadores) y OPERADOR (solo consulta el
-- panel de operación, p. ej. /admin/salud).

create table public.platform_admins (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  nombre text not null,
  rol text not null default 'OPERADOR' check (rol in ('ADMIN', 'OPERADOR')),
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;

-- security definer para evitar recursión de RLS (mismo patrón que
-- user_rol()/is_write_role() en 20260821150100_rls_policies.sql).
create or replace function public.is_platform_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.platform_admins where id = auth.uid() and rol = 'ADMIN'
  );
$$;

-- Cualquier usuario autenticado puede leer SU PROPIA fila — es como el
-- servidor (con el cliente normal, sin service role) resuelve "¿soy
-- admin/operador de plataforma?" en middleware/layout/rutas.
create policy "platform_admins_select_self" on public.platform_admins
  for select using (id = auth.uid());

-- Alta/edición/baja de otras filas: solo un ADMIN de plataforma ya
-- existente (vía la API, con el cliente service role — el primer ADMIN se
-- crea con un endpoint de bootstrap de un solo uso, ver
-- /api/admin/platform-admins/bootstrap). Estas policies son la red de
-- seguridad si algo más intentara escribir con el cliente normal.
create policy "platform_admins_insert_admin" on public.platform_admins
  for insert with check (public.is_platform_admin());

create policy "platform_admins_update_admin" on public.platform_admins
  for update using (public.is_platform_admin());

create policy "platform_admins_delete_admin" on public.platform_admins
  for delete using (public.is_platform_admin());
