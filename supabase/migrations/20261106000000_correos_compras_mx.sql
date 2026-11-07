-- Bandeja de correos de Compras MX.
--
-- Cada empresa tiene una dirección de entrada propia
-- (`<alias_correo>@<subdominio de entrada>`). Los correos que llegan a ella
-- (reenviados desde el correo registrado en Compras MX, o dados de alta
-- directamente) los recibe el proveedor de correo entrante, que avisa por
-- webhook; el webhook guarda cada uno en `correos_compras_mx` con service_role.
-- Desde la app, el usuario los asocia a una licitación existente o los descarta.
--
-- 1. `organizations.alias_correo`: parte local de la dirección de entrada.
--    Única, con sufijo aleatorio para que no sea adivinable. No cambia después
--    de creada (un usuario no puede apropiarse del alias de otra empresa).
-- 2. `correos_compras_mx`: un correo recibido. Idempotente por
--    `resend_email_id` (el proveedor reintenta los webhooks). Solo service_role
--    inserta; los usuarios de la organización leen y cambian únicamente el
--    estado de gestión (asociar / descartar), nunca el contenido recibido.
--
-- Rollback:
--   drop table if exists public.correos_compras_mx;
--   drop trigger if exists organizations_alias_correo on public.organizations;
--   drop function if exists public.organizations_alias_correo();
--   drop function if exists public.correos_compras_mx_solo_gestion();
--   alter table public.organizations drop column if exists alias_correo;  -- safe: columna nueva, derivable

-- ── 1. alias de correo por organización ─────────────────────────────────
alter table public.organizations add column alias_correo text;

create or replace function public.alias_correo_nuevo(p_nombre text, p_id uuid)
returns text
language sql
set search_path = public
as $$
  select left(
           coalesce(
             nullif(
               trim(both '-' from regexp_replace(
                 lower(translate(coalesce(p_nombre, ''), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')),
                 '[^a-z0-9]+', '-', 'g')),
               ''),
             'empresa'),
           24)
         || '-' || substr(md5(p_id::text || clock_timestamp()::text || random()::text), 1, 5);
$$;

update public.organizations
   set alias_correo = public.alias_correo_nuevo(nombre, id)
 where alias_correo is null;

-- Solo servía para el backfill.
drop function public.alias_correo_nuevo(text, uuid);

-- Las organizaciones nuevas reciben un alias aleatorio por defecto (el
-- backfill de arriba, con el nombre de la empresa, solo aplica a las que ya
-- existían); así los INSERT existentes no necesitan cambiar.
alter table public.organizations
  alter column alias_correo set default ('empresa-' || substr(md5(clock_timestamp()::text || random()::text), 1, 10)),
  alter column alias_correo set not null,
  add constraint organizations_alias_correo_formato
    check (alias_correo ~ '^[a-z0-9][a-z0-9-]{2,40}$'),
  add constraint organizations_alias_correo_unico unique (alias_correo);

comment on column public.organizations.alias_correo is
  'Parte local de la dirección de entrada de correos de Compras MX de esta empresa (<alias>@<subdominio de entrada>). Inmutable salvo para service_role.';

create or replace function public.organizations_alias_correo()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.alias_correo is distinct from old.alias_correo
     and coalesce(auth.role(), 'service_role') <> 'service_role' then
    raise exception 'alias_correo no se puede cambiar' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger organizations_alias_correo
  before update of alias_correo on public.organizations
  for each row
  execute function public.organizations_alias_correo();

-- ── 2. correos recibidos ────────────────────────────────────────────────
create table public.correos_compras_mx (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- Id del correo en el proveedor de correo entrante; clave de idempotencia.
  resend_email_id text not null unique,
  message_id text,
  de text not null,
  para text[] not null default '{}',
  asunto text not null default '',
  -- Solo texto: el HTML del remitente nunca se guarda ni se muestra.
  cuerpo_texto text not null default '',
  adjuntos jsonb not null default '[]'::jsonb,
  -- true si el remitente es un dominio gubernamental (.gob.mx).
  remitente_reconocido boolean not null default false,
  recibido_en timestamptz not null,
  estado text not null default 'PENDIENTE'
    check (estado = any (array['PENDIENTE', 'ASOCIADO', 'DESCARTADO'])),
  -- Licitación a la que se asoció. Si la licitación se elimina queda null
  -- (el correo se conserva como historial); no se fuerza coherencia con
  -- `estado` por esa razón.
  licitacion_id uuid references public.licitaciones (id) on delete set null,
  -- Licitación sugerida al recibirlo (su número de expediente aparece en el correo).
  sugerencia_licitacion_id uuid references public.licitaciones (id) on delete set null,
  gestionado_por uuid references public.users (id) on delete set null,
  gestionado_en timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.correos_compras_mx is
  'Correos de Compras MX recibidos en la dirección de entrada de la empresa. Insert solo service_role; los usuarios solo cambian estado/licitacion_id (asociar o descartar).';

create index correos_compras_mx_bandeja_idx
  on public.correos_compras_mx (organization_id, estado, recibido_en desc);
create index correos_compras_mx_licitacion_idx
  on public.correos_compras_mx (licitacion_id) where licitacion_id is not null;

alter table public.correos_compras_mx enable row level security;

create policy "correos_select_own_org" on public.correos_compras_mx
  for select using (organization_id = public.user_org_id());

create policy "correos_update_own_org" on public.correos_compras_mx
  for update
  using (organization_id = public.user_org_id() and public.is_write_role())
  with check (
    organization_id = public.user_org_id()
    and public.is_write_role()
    and (licitacion_id is null or public.licitacion_org_matches(licitacion_id))
  );
-- Sin política de insert ni de delete: solo service_role (bypassa RLS).

-- Quien gestiona solo puede tocar el estado; el contenido recibido es evidencia.
create or replace function public.correos_compras_mx_solo_gestion()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(auth.role(), 'service_role') = 'service_role' then
    return new;
  end if;
  if new.organization_id is distinct from old.organization_id
     or new.resend_email_id is distinct from old.resend_email_id
     or new.message_id is distinct from old.message_id
     or new.de is distinct from old.de
     or new.para is distinct from old.para
     or new.asunto is distinct from old.asunto
     or new.cuerpo_texto is distinct from old.cuerpo_texto
     or new.adjuntos is distinct from old.adjuntos
     or new.remitente_reconocido is distinct from old.remitente_reconocido
     or new.recibido_en is distinct from old.recibido_en
     or new.sugerencia_licitacion_id is distinct from old.sugerencia_licitacion_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Solo se puede cambiar el estado de gestión de un correo recibido'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger correos_compras_mx_solo_gestion
  before update on public.correos_compras_mx
  for each row
  execute function public.correos_compras_mx_solo_gestion();
