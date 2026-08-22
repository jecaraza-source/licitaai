-- LicitaAI — Sprint 7: rate limiting para endpoints de IA (sin dependencias externas)
-- Ventana deslizante simple: máx N solicitudes por usuario por minuto.

create table public.rate_limit_hits (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  ruta text not null,
  created_at timestamptz not null default now()
);

create index rate_limit_hits_user_ruta_idx on public.rate_limit_hits (user_id, ruta, created_at desc);

alter table public.rate_limit_hits enable row level security;

-- Solo el propio backend (vía RPC security definer) escribe/lee esta tabla;
-- no se expone select/insert directo a los clientes.
create policy "rate_limit_hits_no_direct_access" on public.rate_limit_hits
  for all using (false) with check (false);

create or replace function public.check_rate_limit(
  p_ruta text,
  p_max_por_minuto int default 10
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if auth.uid() is null then
    return false;
  end if;

  delete from public.rate_limit_hits
  where user_id = auth.uid() and ruta = p_ruta and created_at < now() - interval '1 minute';

  select count(*) into v_count
  from public.rate_limit_hits
  where user_id = auth.uid() and ruta = p_ruta and created_at >= now() - interval '1 minute';

  if v_count >= p_max_por_minuto then
    return false;
  end if;

  insert into public.rate_limit_hits (user_id, ruta) values (auth.uid(), p_ruta);
  return true;
end;
$$;

revoke execute on function public.check_rate_limit(text, int) from public, anon;
grant execute on function public.check_rate_limit(text, int) to authenticated;
