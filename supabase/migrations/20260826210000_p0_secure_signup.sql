-- LicitaAI — P0.1: elimina la confianza en metadatos controlados por el
-- cliente durante el alta de usuarios.
--
-- Vulnerabilidad corregida: handle_new_user() insertaba
-- organization_id/rol/rol_jerarquico directamente desde
-- new.raw_user_meta_data, que el cliente controla por completo en la
-- llamada pública supabase.auth.signUp(). Cualquiera podía llamar signUp()
-- directamente (sin pasar por /register ni por una invitación real) con
-- { organization_id: '<uuid de cualquier organización>', rol: 'ADMIN',
-- rol_jerarquico: 'SUPERVISOR' } y el trigger lo insertaba tal cual —
-- alta fraudulenta como ADMIN en una organización ajena.
--
-- Adicionalmente, para el flujo de invitación, la validación real
-- (token vigente, no usado, correo coincide) ocurría en
-- aceptar_invitacion_staff(), llamada DESPUÉS de que handle_new_user() ya
-- había insertado la fila en public.users con los metadatos que el cliente
-- decidió enviar — sin ninguna verificación cruzada entre ambos pasos.
--
-- Diseño nuevo (decisión documentada en docs/security-p0-hardening.md):
-- un ticket de un solo uso, emitido por una función SECURITY DEFINER
-- restringida (create_organization_for_signup) o por la fila de invitación
-- ya existente (invitaciones_staff), se consume ATÓMICAMENTE dentro del
-- mismo trigger handle_new_user() que crea la fila en public.users. El
-- cliente solo puede enviar `nombre` y el identificador del ticket/token;
-- organization_id, rol y rol_jerarquico se leen siempre de las filas
-- internas (signup_tickets / invitaciones_staff), nunca del payload.

-- ============================================================================
-- 1) signup_tickets: ticket de un solo uso para alta de organización nueva
-- ============================================================================
create table public.signup_tickets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  rol_jerarquico text check (rol_jerarquico in ('EJECUTOR', 'INTEGRADOR', 'SUPERVISOR')),
  used_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '1 hour')
);

create index signup_tickets_organization_id_idx on public.signup_tickets (organization_id);

alter table public.signup_tickets enable row level security;

-- Nadie accede a esta tabla directamente; solo funciones SECURITY DEFINER
-- (mismo patrón que rate_limit_hits).
create policy "signup_tickets_no_direct_access" on public.signup_tickets
  for all using (false) with check (false);

-- ============================================================================
-- 2) create_organization_for_signup: ahora devuelve un ticket, no el
--    organization_id directamente, y valida el nombre + aplica un freno
--    burdo contra creación masiva de organizaciones.
-- ============================================================================
create or replace function public.create_organization_for_signup(p_nombre text, p_rfc text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_ticket_id uuid;
  v_recientes int;
begin
  if auth.uid() is not null then
    raise exception 'Usuarios autenticados no pueden crear organizaciones vía signup';
  end if;

  if p_nombre is null or length(trim(p_nombre)) < 2 then
    raise exception 'Nombre de organización inválido';
  end if;

  -- Freno burdo (sin identidad de anon disponible para limitar por IP/actor)
  -- contra scripts que crean organizaciones en masa: tope global de altas
  -- por ventana de 10 minutos. Riesgo residual documentado — no sustituye
  -- un límite por IP en la capa de Next.js.
  select count(*) into v_recientes
  from public.organizations
  where created_at > now() - interval '10 minutes';

  if v_recientes >= 30 then
    raise exception 'Se alcanzó el límite temporal de registros nuevos, intenta de nuevo en unos minutos';
  end if;

  insert into public.organizations (nombre, rfc)
  values (trim(p_nombre), nullif(trim(coalesce(p_rfc, '')), ''))
  returning id into v_org_id;

  insert into public.signup_tickets (organization_id)
  values (v_org_id)
  returning id into v_ticket_id;

  return v_ticket_id;
end;
$$;

revoke execute on function public.create_organization_for_signup(text, text) from public, authenticated;
grant execute on function public.create_organization_for_signup(text, text) to anon;

-- ============================================================================
-- 3) handle_new_user: única fuente de verdad para organization_id/rol/
--    rol_jerarquico. Ignora por completo esos campos si vienen en
--    raw_user_meta_data — solo lee `nombre` de ahí. Requiere un
--    signup_ticket (alta de organización nueva, rol ADMIN) o un
--    invite_token (invitación de staff, rol ANALYST) válidos, consumidos
--    atómicamente en esta misma transacción mediante UPDATE ... WHERE
--    used_at/aceptada_at IS NULL, lo que hace que dos intentos
--    concurrentes con el mismo ticket/token nunca puedan ganar ambos
--    (el segundo UPDATE no encuentra fila y la función aborta).
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_signup_ticket uuid;
  v_invite_token uuid;
  v_ticket public.signup_tickets%rowtype;
  v_invite public.invitaciones_staff%rowtype;
  v_org_id uuid;
  v_rol text;
  v_rol_jerarquico text;
  v_email text := lower(trim(new.email));
begin
  begin
    v_signup_ticket := nullif(new.raw_user_meta_data ->> 'signup_ticket', '')::uuid;
  exception when invalid_text_representation then
    v_signup_ticket := null;
  end;
  begin
    v_invite_token := nullif(new.raw_user_meta_data ->> 'invite_token', '')::uuid;
  exception when invalid_text_representation then
    v_invite_token := null;
  end;

  if v_signup_ticket is not null then
    update public.signup_tickets
      set used_at = now()
      where id = v_signup_ticket
        and used_at is null
        and expires_at > now()
      returning * into v_ticket;

    if v_ticket.id is null then
      raise exception 'Ticket de registro inválido, ya usado o expirado';
    end if;

    v_org_id := v_ticket.organization_id;
    v_rol := 'ADMIN';
    v_rol_jerarquico := v_ticket.rol_jerarquico;

  elsif v_invite_token is not null then
    update public.invitaciones_staff
      set aceptada_at = now()
      where token = v_invite_token
        and aceptada_at is null
        and expires_at > now()
        and lower(trim(email)) = v_email
      returning * into v_invite;

    if v_invite.id is null then
      raise exception 'Invitación inválida, ya usada, expirada o no corresponde a este correo';
    end if;

    v_org_id := v_invite.organization_id;
    v_rol := 'ANALYST';
    v_rol_jerarquico := v_invite.rol_jerarquico;

  else
    raise exception 'Falta un ticket de registro o token de invitación válido';
  end if;

  insert into public.users (id, organization_id, email, nombre, rol, rol_jerarquico)
  values (
    new.id,
    v_org_id,
    new.email,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'nombre'), ''), new.email),
    v_rol,
    v_rol_jerarquico
  );
  return new;
end;
$$;

-- ============================================================================
-- 4) aceptar_invitacion_staff: la invitación ya se consume atómicamente en
--    handle_new_user(). Esta función se conserva por compatibilidad (la
--    llama src/app/(auth)/invitacion/[token]/page.tsx tras el signUp) pero
--    ahora es solo una verificación idempotente de consistencia — no puede
--    cambiar organización, rol ni rol_jerarquico de nadie por sí misma.
-- ============================================================================
create or replace function public.aceptar_invitacion_staff(p_token uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.invitaciones_staff%rowtype;
  v_user public.users%rowtype;
begin
  select * into v_invite from public.invitaciones_staff where token = p_token;
  if v_invite.id is null then
    raise exception 'Invitación no encontrada';
  end if;

  select * into v_user from public.users where id = auth.uid();
  if v_user.id is null then
    raise exception 'No autenticado';
  end if;

  if v_invite.aceptada_at is null
     or v_user.organization_id is distinct from v_invite.organization_id
     or v_user.rol_jerarquico is distinct from v_invite.rol_jerarquico then
    raise exception 'La invitación no corresponde al estado actual de la cuenta';
  end if;
end;
$$;

-- ============================================================================
-- 5) Limpieza de tickets vencidos y organizaciones abandonadas (sin usuario
--    creado). Debe programarse externamente (pg_cron o un cron de Vercel
--    que invoque un endpoint protegido) — ver docs/security-p0-hardening.md.
-- ============================================================================
create or replace function public.cleanup_expired_signup_tickets()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_borrados int;
begin
  with organizaciones_abandonadas as (
    select o.id
    from public.organizations o
    join public.signup_tickets t on t.organization_id = o.id
    where t.used_at is null
      and t.expires_at < now()
      and not exists (select 1 from public.users u where u.organization_id = o.id)
  )
  delete from public.organizations o
  using organizaciones_abandonadas a
  where o.id = a.id;
  get diagnostics v_borrados = row_count;
  return v_borrados;
end;
$$;

revoke execute on function public.cleanup_expired_signup_tickets() from public, anon, authenticated;
