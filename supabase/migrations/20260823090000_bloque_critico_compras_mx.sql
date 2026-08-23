-- LicitaAI: Bloque crítico del proceso operativo de Compras MX
--
-- 1) Matriz de requisitos: semáforo de 4 estados (VERDE/AMARILLO/ROJO/GRIS) en
--    vez de PENDIENTE/COMPLETO/NO_APLICA, bandera de "crítico" y columnas de
--    control (fuente, responsable, fecha límite, causa de desechamiento,
--    observaciones) — Pasos 4, 25 y 26 del proceso operativo.
-- 2) Checklist final de liberación: compuerta manual antes de marcar un
--    procedimiento como enviado — Paso 29.
-- 3) Conciliación de 4 niveles: columnas para registrar lo efectivamente
--    capturado en Compras MX y compararlo contra la hoja maestra — Paso 14.

-- ============================================================================
-- 1) checklist_items: semáforo de 4 estados + columnas de control
-- ============================================================================

alter table public.checklist_items drop constraint checklist_items_estado_check;

update public.checklist_items set estado = 'VERDE' where estado = 'COMPLETO';
update public.checklist_items set estado = 'GRIS' where estado = 'NO_APLICA';
update public.checklist_items set estado = 'AMARILLO' where estado = 'PENDIENTE';

alter table public.checklist_items
  alter column estado set default 'AMARILLO',
  add constraint checklist_items_estado_check
    check (estado = any (array['VERDE', 'AMARILLO', 'ROJO', 'GRIS']));

alter table public.checklist_items
  add column critico boolean not null default false,
  add column fuente text,
  add column responsable_id uuid references public.users (id) on delete set null,
  add column fecha_limite timestamptz,
  add column causa_desechamiento text,
  add column observaciones text;

comment on column public.checklist_items.estado is
  'Semáforo de 4 estados: VERDE (cumplido y validado), AMARILLO (en proceso), ROJO (riesgo, no cumple), GRIS (no aplica).';
comment on column public.checklist_items.critico is
  'Un requisito crítico en ROJO o AMARILLO bloquea la liberación del procedimiento (Paso 29).';

-- ============================================================================
-- 2) checklist_liberacion: compuerta manual antes de marcar como enviada
-- ============================================================================

create table public.checklist_liberacion (
  id uuid primary key default gen_random_uuid(),
  licitacion_id uuid not null unique references public.licitaciones (id) on delete cascade,
  items_json jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.checklist_liberacion enable row level security;

create policy "checklist_liberacion_select_own_org" on public.checklist_liberacion
  for select using (public.licitacion_org_matches(licitacion_id));

create policy "checklist_liberacion_write_own_org" on public.checklist_liberacion
  for insert with check (public.licitacion_org_matches(licitacion_id) and public.is_write_role());

create policy "checklist_liberacion_update_own_org" on public.checklist_liberacion
  for update using (public.licitacion_org_matches(licitacion_id) and public.is_write_role());

create trigger checklist_liberacion_set_updated_at
  before update on public.checklist_liberacion
  for each row
  execute function public.set_updated_at();

-- ============================================================================
-- 3) propuesta_economica_partidas: conciliación de 4 niveles con Compras MX
-- ============================================================================

alter table public.propuesta_economica_partidas
  add column cantidad_compras_mx numeric,
  add column precio_unitario_compras_mx numeric,
  add column total_compras_mx numeric;

comment on column public.propuesta_economica_partidas.total_compras_mx is
  'Lo efectivamente capturado en la plataforma Compras MX, para conciliar contra la hoja maestra (Paso 14). Se captura manualmente porque Compras MX no expone una API pública.';
