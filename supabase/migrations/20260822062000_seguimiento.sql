-- LicitaAI — Sprint 6: seguimiento post-entrega

create table public.seguimiento (
  id uuid primary key default gen_random_uuid(),
  licitacion_id uuid not null unique references public.licitaciones (id) on delete cascade,
  acta_apertura_tecnica_documento_id uuid references public.documentos (id) on delete set null,
  acta_apertura_economica_documento_id uuid references public.documentos (id) on delete set null,
  acta_fallo_documento_id uuid references public.documentos (id) on delete set null,
  resultado_json jsonb default '{}'::jsonb,
  lecciones_aprendidas text,
  tags_json jsonb default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.seguimiento enable row level security;

create policy "seguimiento_select_own_org" on public.seguimiento
  for select using (public.licitacion_org_matches(licitacion_id));

create policy "seguimiento_insert_own_org" on public.seguimiento
  for insert with check (public.licitacion_org_matches(licitacion_id) and public.is_write_role());

create policy "seguimiento_update_own_org" on public.seguimiento
  for update using (public.licitacion_org_matches(licitacion_id) and public.is_write_role());

create trigger seguimiento_set_updated_at
  before update on public.seguimiento
  for each row
  execute function public.set_updated_at();
