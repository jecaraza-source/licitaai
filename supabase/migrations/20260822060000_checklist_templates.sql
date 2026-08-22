-- LicitaAI — Sprint 6: plantillas de checklist por estado/jurisdicción

create table public.checklist_templates (
  id uuid primary key default gen_random_uuid(),
  estado_id text not null check (estado_id in ('FEDERAL', 'EDOMEX', 'CDMX')),
  categoria text not null check (categoria in ('LEGAL', 'FISCAL', 'TECNICO', 'ECONOMICO', 'ESPECIFICO')),
  descripcion text not null,
  fundamento_legal text,
  vigencia_requerida text,
  formato_aceptado text,
  requerido boolean not null default true
);

create index checklist_templates_estado_id_idx on public.checklist_templates (estado_id);

alter table public.checklist_templates enable row level security;

create policy "checklist_templates_select_authenticated" on public.checklist_templates
  for select using (auth.role() = 'authenticated');

insert into public.checklist_templates (estado_id, categoria, descripcion, fundamento_legal, vigencia_requerida, formato_aceptado, requerido)
values
  ('FEDERAL', 'FISCAL', 'Constancia de Situación Fiscal (RFC) vigente', 'Artículo 29 LAASSP', 'No mayor a 30 días', 'PDF', true),
  ('FEDERAL', 'FISCAL', 'Opinión de cumplimiento de obligaciones fiscales (32-D) positiva', 'Artículo 32-D CFF', 'No mayor a 30 días', 'PDF', true),
  ('FEDERAL', 'LEGAL', 'Acta constitutiva y modificaciones', 'Artículo 29 LAASSP', null, 'PDF', true),
  ('FEDERAL', 'LEGAL', 'Poder notarial del representante legal', 'Artículo 29 LAASSP', null, 'PDF', true),
  ('FEDERAL', 'LEGAL', 'Identificación oficial del representante legal', null, 'Vigente', 'PDF', true),
  ('FEDERAL', 'ECONOMICO', 'Declaración de integridad y no colusión', 'Artículo 29 LAASSP', null, 'PDF', true),
  ('EDOMEX', 'FISCAL', 'Constancia de Situación Fiscal (RFC) vigente', 'Ley de Contratación Pública del Edoméx', 'No mayor a 30 días', 'PDF', true),
  ('EDOMEX', 'LEGAL', 'Acta constitutiva y modificaciones', 'Ley de Contratación Pública del Edoméx', null, 'PDF', true),
  ('EDOMEX', 'LEGAL', 'Identificación oficial del representante legal', null, 'Vigente', 'PDF', true),
  ('EDOMEX', 'ECONOMICO', 'Declaración de integridad', null, null, 'PDF', true),
  ('CDMX', 'FISCAL', 'Constancia de Situación Fiscal (RFC) vigente', 'Ley de Adquisiciones para el DF', 'No mayor a 30 días', 'PDF', true),
  ('CDMX', 'LEGAL', 'Acta constitutiva y modificaciones', 'Ley de Adquisiciones para el DF', null, 'PDF', true),
  ('CDMX', 'LEGAL', 'Identificación oficial del representante legal', null, 'Vigente', 'PDF', true),
  ('CDMX', 'ECONOMICO', 'Declaración de integridad', null, null, 'PDF', true);
