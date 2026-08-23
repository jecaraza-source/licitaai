-- LicitaAI: Bloque "Importante" del proceso operativo de Compras MX
--
-- 1) Matriz de cumplimiento técnico requisito-por-requisito (Paso 11).
-- 2) Análisis de viabilidad Go/No-Go antes de invertir en la propuesta (Paso 7).
-- 3) Vínculo entre respuestas de junta de aclaraciones y requisitos afectados,
--    para que la matriz se actualice cuando cambia una aclaración (Paso 9).
-- 4) Registro dedicado de evidencia/acuse de envío (Paso 19).

-- ============================================================================
-- 1) especificaciones técnicas extraídas + matriz de cumplimiento técnico
-- ============================================================================

alter table public.analisis_bases
  add column especificaciones_tecnicas_json jsonb default '[]'::jsonb;

create table public.requisitos_tecnicos (
  id uuid primary key default gen_random_uuid(),
  licitacion_id uuid not null references public.licitaciones (id) on delete cascade,
  orden integer not null default 0,
  requisito text not null,
  obligatorio boolean not null default true,
  cumple boolean,
  como_cumple text,
  evidencia text,
  documento_id uuid references public.documentos (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on column public.requisitos_tecnicos.cumple is
  'null = pendiente de evaluar, true = cumple, false = no cumple. La propuesta debe demostrar, no solo declarar (Paso 11).';

alter table public.requisitos_tecnicos enable row level security;

create policy "requisitos_tecnicos_select_own_org" on public.requisitos_tecnicos
  for select using (public.licitacion_org_matches(licitacion_id));

create policy "requisitos_tecnicos_write_own_org" on public.requisitos_tecnicos
  for insert with check (public.licitacion_org_matches(licitacion_id) and public.is_write_role());

create policy "requisitos_tecnicos_update_own_org" on public.requisitos_tecnicos
  for update using (public.licitacion_org_matches(licitacion_id) and public.is_write_role());

create policy "requisitos_tecnicos_delete_own_org" on public.requisitos_tecnicos
  for delete using (public.licitacion_org_matches(licitacion_id) and public.is_write_role());

-- ============================================================================
-- 2) viabilidad: Go/No-Go antes de invertir en la propuesta
-- ============================================================================

create table public.viabilidad (
  id uuid primary key default gen_random_uuid(),
  licitacion_id uuid not null unique references public.licitaciones (id) on delete cascade,
  respuestas_json jsonb not null default '[]'::jsonb,
  decision text check (decision = any (array['GO', 'NO_GO'])),
  decidido_por uuid references public.users (id) on delete set null,
  decidido_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.viabilidad enable row level security;

create policy "viabilidad_select_own_org" on public.viabilidad
  for select using (public.licitacion_org_matches(licitacion_id));

create policy "viabilidad_write_own_org" on public.viabilidad
  for insert with check (public.licitacion_org_matches(licitacion_id) and public.is_write_role());

create policy "viabilidad_update_own_org" on public.viabilidad
  for update using (public.licitacion_org_matches(licitacion_id) and public.is_write_role());

create trigger viabilidad_set_updated_at
  before update on public.viabilidad
  for each row
  execute function public.set_updated_at();

-- ============================================================================
-- 3) checklist_items: vínculo con la aclaración que lo modificó
-- ============================================================================

alter table public.checklist_items
  add column aclaracion_id uuid references public.junta_aclaraciones (id) on delete set null;

comment on column public.checklist_items.aclaracion_id is
  'Aclaración que modificó este requisito por última vez. Al vincularse, el requisito vuelve a AMARILLO para forzar su re-verificación (Paso 9).';

-- ============================================================================
-- 4) evidencia_envio: registro inmutable del acuse de envío (Paso 19)
-- ============================================================================

create table public.evidencia_envio (
  id uuid primary key default gen_random_uuid(),
  licitacion_id uuid not null references public.licitaciones (id) on delete cascade,
  documento_id uuid references public.documentos (id) on delete set null,
  notas text,
  registrado_por uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.evidencia_envio is
  'Registro de acuse/evidencia de envío. No se edita ni se borra: una re-presentación agrega un nuevo registro, nunca reemplaza el anterior (Paso 19).';

alter table public.evidencia_envio enable row level security;

create policy "evidencia_envio_select_own_org" on public.evidencia_envio
  for select using (public.licitacion_org_matches(licitacion_id));

create policy "evidencia_envio_insert_own_org" on public.evidencia_envio
  for insert with check (public.licitacion_org_matches(licitacion_id) and public.is_write_role());
