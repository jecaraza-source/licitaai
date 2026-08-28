-- P2 · E2 — circuit breakers por proveedor externo (ADR 0005).
--
-- Estado compartido en Postgres para que todas las Edge Functions, el
-- worker y las rutas de Next.js vean el mismo circuito. Máquina de estados:
--   CLOSED  -> (>= umbral fallos consecutivos) -> OPEN
--   OPEN    -> (pasado abierto_hasta)          -> HALF_OPEN  (deja pasar 1)
--   HALF_OPEN -> éxito -> CLOSED  |  fallo -> OPEN
--
-- Todo detrás del flag `resiliencia.circuit_breaker` en la capa de
-- aplicación: esta migración solo crea el esquema y las funciones.
--
-- Rollback:
--   drop function if exists public.cb_estado(text);
--   drop function if exists public.cb_registrar_exito(text);
--   drop function if exists public.cb_registrar_fallo(text,integer,integer);
--   drop table if exists public.provider_health;

create table public.provider_health (
  provider text primary key,
  estado text not null default 'CLOSED' check (estado in ('CLOSED', 'OPEN', 'HALF_OPEN')),
  fallos_consecutivos integer not null default 0,
  abierto_hasta timestamptz,
  ultimo_fallo_at timestamptz,
  ultimo_exito_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.provider_health (provider) values
  ('anthropic'), ('openai'), ('resend')
on conflict (provider) do nothing;

alter table public.provider_health enable row level security;
-- Lectura para authenticated (la UI muestra "servicio de IA no disponible");
-- sin escritura directa — solo las funciones SECURITY DEFINER / service_role.
create policy provider_health_select_authenticated
  on public.provider_health for select to authenticated using (true);

-- cb_estado — estado EFECTIVO del circuito (resuelve OPEN->HALF_OPEN por
-- tiempo). No muta salvo la transición temporal OPEN->HALF_OPEN.
create or replace function public.cb_estado(p_provider text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.provider_health;
begin
  select * into v from public.provider_health where provider = p_provider;
  if not found then
    insert into public.provider_health (provider) values (p_provider)
    on conflict (provider) do nothing;
    return 'CLOSED';
  end if;

  if v.estado = 'OPEN' and v.abierto_hasta is not null and v.abierto_hasta <= now() then
    update public.provider_health set estado = 'HALF_OPEN' where provider = p_provider;
    return 'HALF_OPEN';
  end if;
  return v.estado;
end;
$$;

create or replace function public.cb_registrar_exito(p_provider text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.provider_health (provider, estado, fallos_consecutivos, abierto_hasta, ultimo_exito_at)
  values (p_provider, 'CLOSED', 0, null, now())
  on conflict (provider) do update
    set estado = 'CLOSED', fallos_consecutivos = 0, abierto_hasta = null, ultimo_exito_at = now();
$$;

-- cb_registrar_fallo — incrementa el contador y abre el circuito si se
-- alcanza el umbral (o si estaba HALF_OPEN). p_umbral / p_abierto_segundos
-- los pasa el llamante (config en la app), con defaults sensatos.
create or replace function public.cb_registrar_fallo(
  p_provider text,
  p_umbral integer default 5,
  p_abierto_segundos integer default 60
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.provider_health;
  v_nuevos integer;
  v_estado text;
begin
  select * into v from public.provider_health where provider = p_provider for update;
  if not found then
    insert into public.provider_health (provider) values (p_provider);
    v.fallos_consecutivos := 0;
    v.estado := 'CLOSED';
  end if;

  v_nuevos := v.fallos_consecutivos + 1;
  if v.estado = 'HALF_OPEN' or v_nuevos >= greatest(p_umbral, 1) then
    v_estado := 'OPEN';
    update public.provider_health
       set estado = 'OPEN', fallos_consecutivos = v_nuevos,
           abierto_hasta = now() + make_interval(secs => greatest(p_abierto_segundos, 5)),
           ultimo_fallo_at = now()
     where provider = p_provider;
  else
    v_estado := v.estado;
    update public.provider_health
       set fallos_consecutivos = v_nuevos, ultimo_fallo_at = now()
     where provider = p_provider;
  end if;
  return v_estado;
end;
$$;

-- reencolar_por_espera — cuando el worker no pudo trabajar el job por una
-- razón EXTERNA transitoria (circuito abierto), lo devuelve a la cola con
-- una espera y REVIERTE el incremento de intentos del claim (no consume
-- presupuesto de reintentos).
create or replace function public.reencolar_por_espera(
  p_job_id uuid,
  p_segundos integer
) returns void
language sql
security definer
set search_path = public
as $$
  update public.jobs
     set estado = 'RETRYING',
         intentos = greatest(intentos - 1, 0),
         next_attempt_at = now() + make_interval(secs => greatest(coalesce(p_segundos, 60), 5)),
         lease_expires_at = null
   where id = p_job_id and estado = 'RUNNING';
$$;

revoke all on function public.cb_estado(text) from public;
revoke all on function public.cb_registrar_exito(text) from public;
revoke all on function public.cb_registrar_fallo(text, integer, integer) from public;
revoke all on function public.reencolar_por_espera(uuid, integer) from public;
grant execute on function public.cb_estado(text) to authenticated, service_role;
grant execute on function public.cb_registrar_exito(text) to service_role;
grant execute on function public.cb_registrar_fallo(text, integer, integer) to service_role;
grant execute on function public.reencolar_por_espera(uuid, integer) to service_role;
