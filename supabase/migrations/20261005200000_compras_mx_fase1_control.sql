-- Compras MX · Fase 1 — control real antes de enviar (Pasos 15, 17 y 29).
--
-- 1) `revisiones_independientes`: segundo revisor (doble check, Paso 17) para
--    lo que NO es una fila de `propuestas`. La propuesta técnica ya lleva
--    `revisor_id`/`revisado_at` en `propuestas`; la económica (partidas +
--    configuración) no tiene versión propia, así que la revisión se liga a un
--    hash del contenido: si las partidas cambian después de revisar, la
--    revisión deja de valer y hay que repetirla.
-- 2) Flags por organización (ambos OFF, no cambian nada hasta activarlos):
--      gate.revisor_independiente — el paso a ENVIADA exige revisión confirmada
--                                   por alguien distinto del autor.
--      gate.liberacion_ampliada   — checklist de liberación de 26 puntos
--                                   (Paso 29) en vez de 15.
--
-- Rollback:
--   drop table if exists public.revisiones_independientes;
--   delete from public.feature_flags
--    where key in ('gate.revisor_independiente', 'gate.liberacion_ampliada');

create table public.revisiones_independientes (
  id uuid primary key default gen_random_uuid(),
  licitacion_id uuid not null references public.licitaciones (id) on delete cascade,
  ambito text not null check (ambito = any (array['ECONOMICA'])),
  elaborado_por uuid references public.users (id) on delete set null,
  revisor_id uuid references public.users (id) on delete set null,
  revisado_at timestamptz,
  contenido_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (licitacion_id, ambito),
  constraint revisiones_revisor_distinto_del_autor
    check (revisor_id is null or revisor_id is distinct from elaborado_por),
  constraint revisiones_confirmada_tiene_hash
    check (revisado_at is null or contenido_hash is not null)
);

comment on table public.revisiones_independientes is
  'Doble check (Paso 17) de entregables sin versión propia. contenido_hash = huella del contenido que el revisor confirmó; si cambia, la revisión queda obsoleta.';

alter table public.revisiones_independientes enable row level security;

create policy "revisiones_select_own_org" on public.revisiones_independientes
  for select using (public.licitacion_org_matches(licitacion_id));

create policy "revisiones_insert_own_org" on public.revisiones_independientes
  for insert with check (public.licitacion_org_matches(licitacion_id) and public.is_write_role());

create policy "revisiones_update_own_org" on public.revisiones_independientes
  for update using (public.licitacion_org_matches(licitacion_id) and public.is_write_role());

create trigger revisiones_independientes_set_updated_at
  before update on public.revisiones_independientes
  for each row
  execute function public.set_updated_at();

insert into public.feature_flags (key, descripcion) values
  ('gate.revisor_independiente', 'Compras MX F1 — bloquear el paso a ENVIADA si la propuesta técnica o económica no tiene revisión confirmada por alguien distinto del autor (Paso 17)'),
  ('gate.liberacion_ampliada', 'Compras MX F1 — checklist de liberación de 26 puntos (Paso 29) en lugar de 15')
on conflict (key) do nothing;
