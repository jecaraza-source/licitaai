-- LicitaAI — Sprint 1: fix del flujo de registro
--
-- Problema: INSERT ... RETURNING sobre organizations re-evalúa la policy de
-- SELECT ("id = user_org_id()"), y anon no tiene fila en public.users, por lo
-- que la fila recién creada nunca es visible al cliente anónimo (y tras
-- revocar EXECUTE de user_org_id() a anon, el intento ni siquiera podía
-- evaluar la policy). Abrir SELECT a todo anon expondría el directorio
-- completo de organizaciones, así que en su lugar exponemos una función
-- SECURITY DEFINER de un solo propósito para el signup.

drop policy if exists "organizations_insert_signup" on public.organizations;

create or replace function public.create_organization_for_signup(p_nombre text, p_rfc text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is not null then
    raise exception 'Usuarios autenticados no pueden crear organizaciones vía signup';
  end if;

  insert into public.organizations (nombre, rfc)
  values (p_nombre, p_rfc)
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.create_organization_for_signup(text, text) from public, authenticated;
grant execute on function public.create_organization_for_signup(text, text) to anon;
