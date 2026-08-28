-- P0.6 — registro de uso de IA y presupuesto diario por organización.
--
-- Antes de esta migración ninguna llamada a Claude/OpenAI quedaba
-- registrada por organización: un uso excesivo (por error de un usuario o
-- por abuso deliberado, ya que las Edge Functions ahora exigen auth pero no
-- limitan el GASTO, solo la FRECUENCIA vía check_rate_limit) no tenía techo
-- más que el rate limit por minuto. ai_usage_log + check_ai_budget cierran
-- ese hueco con el mismo patrón ya usado por check_rate_limit: una función
-- SECURITY DEFINER que resuelve organization_id/auth.uid() del lado del
-- servidor (nunca confía en un organization_id enviado por el cliente).

create table if not exists public.ai_usage_log (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  funcion text not null,
  modelo text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  created_at timestamptz not null default now(),
  constraint ai_usage_log_tokens_no_negativos check (input_tokens >= 0 and output_tokens >= 0)
);

create index if not exists ai_usage_log_org_created_idx
  on public.ai_usage_log (organization_id, created_at desc);

alter table public.ai_usage_log enable row level security;

-- Solo lectura para miembros de la propia organización. No hay política de
-- INSERT/UPDATE/DELETE para roles regulares a propósito: todo registro pasa
-- por registrar_uso_ia() (SECURITY DEFINER, deriva organization_id/user_id
-- del JWT) o por el service role dentro de una Edge Function ya autorizada.
drop policy if exists ai_usage_log_select_own_org on public.ai_usage_log;
create policy ai_usage_log_select_own_org
  on public.ai_usage_log
  for select
  using (organization_id = public.user_org_id());

create or replace function public.registrar_uso_ia(
  p_funcion text,
  p_modelo text,
  p_input_tokens integer,
  p_output_tokens integer
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  insert into public.ai_usage_log (organization_id, user_id, funcion, modelo, input_tokens, output_tokens)
  values (
    public.user_org_id(),
    auth.uid(),
    p_funcion,
    p_modelo,
    greatest(coalesce(p_input_tokens, 0), 0),
    greatest(coalesce(p_output_tokens, 0), 0)
  );
end;
$$;

revoke all on function public.registrar_uso_ia(text, text, integer, integer) from public;
grant execute on function public.registrar_uso_ia(text, text, integer, integer) to authenticated;

create or replace function public.check_ai_budget(p_limite_diario bigint default 3000000)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total bigint;
begin
  if auth.uid() is null then
    return false;
  end if;

  select coalesce(sum(input_tokens + output_tokens), 0)
    into v_total
    from public.ai_usage_log
   where organization_id = public.user_org_id()
     and created_at >= date_trunc('day', now());

  return v_total < p_limite_diario;
end;
$$;

revoke all on function public.check_ai_budget(bigint) from public;
grant execute on function public.check_ai_budget(bigint) to authenticated;

comment on table public.ai_usage_log is
  'Registro de tokens consumidos por llamada a IA, por organización. Usado por check_ai_budget() para aplicar un tope diario por organización. Rollback: drop function public.check_ai_budget(bigint); drop function public.registrar_uso_ia(text, text, integer, integer); drop table public.ai_usage_log;';
