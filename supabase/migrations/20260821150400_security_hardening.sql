-- LicitaAI — Sprint 1: hardening de linter de seguridad

-- 1) search_path fijo en trigger function
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 2) mover pgvector fuera de public
alter extension vector set schema extensions;

-- 3) reducir superficie de RPC pública de las funciones helper de RLS:
--    anon no las necesita (no hay filas visibles para anon en tablas multi-tenant),
--    authenticated las necesita porque las policies se evalúan con su rol.
revoke execute on function public.user_org_id() from public, anon;
revoke execute on function public.user_rol() from public, anon;
revoke execute on function public.is_write_role() from public, anon;
revoke execute on function public.licitacion_org_matches(uuid) from public, anon;
grant execute on function public.user_org_id() to authenticated;
grant execute on function public.user_rol() to authenticated;
grant execute on function public.is_write_role() to authenticated;
grant execute on function public.licitacion_org_matches(uuid) to authenticated;

-- 4) handle_new_user solo debe ser invocado por el trigger de auth.users,
--    nunca directamente vía RPC.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
