-- P2 · H4 — Export de organización (P2.6, ADR 0010).
--
-- Job `exportar-organizacion`: reúne TODOS los datos de la organización en
-- un bundle jsonb (exportar_datos_organizacion), lo sube al bucket privado
-- `exportaciones` y devuelve una URL firmada de 72 h. Es el paso 1
-- obligatorio del borrado orquestado (H5) y también un derecho del cliente
-- (portabilidad de datos).
--
-- Rollback:
--   alter table public.jobs drop constraint jobs_tipo_check;
--   alter table public.jobs add constraint jobs_tipo_check check (tipo in (... sin 'exportar-organizacion'));
--   drop function if exists public.exportar_datos_organizacion(uuid);
--   delete from storage.buckets where id = 'exportaciones';

-- ── tipo de job ─────────────────────────────────────────────────────────
alter table public.jobs drop constraint jobs_tipo_check;
alter table public.jobs add constraint jobs_tipo_check check (tipo in (
  'noop', 'noop-ef',
  'procesar-documento', 'analizar-bases', 'generar-estudio-mercado',
  'generar-preguntas-junta', 'generar-propuesta-tecnica',
  'auditar-documento', 'auditar-expediente', 'seguimiento-analizar-fallo',
  'analizar-documento-corporativo', 'procesar-referencia-legal',
  'exportar-organizacion'
));

-- ── bucket privado para los ZIP/JSON de export ──────────────────────────
-- Sin políticas de RLS -> solo service_role escribe/lee. Los usuarios
-- reciben una URL firmada (createSignedUrl) generada por el worker.
insert into storage.buckets (id, name, public, file_size_limit)
values ('exportaciones', 'exportaciones', false, 1073741824)  -- 1 GiB
on conflict (id) do nothing;

-- ── bundle de datos ────────────────────────────────────────────────────
-- Un jsonb con una entrada por tabla (arrays de filas). Grande pero
-- acotado: una organización real tiene decenas de licitaciones, no
-- millones de filas. Si algún día no cupiera en memoria del worker, se
-- parte por tabla/paginación (documentado en 13-clasificacion-datos.md).
--
-- NO incluye: embeddings (vector pesado y no portable), secretos (no hay
-- en public.*), ni catálogos globales (feature_flags, prompt_templates,
-- ai_model_pricing, estados_config, referencias_legales).
create or replace function public.exportar_datos_organizacion(p_org uuid)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  with lic as (
    select id from public.licitaciones where organization_id = p_org
  ),
  doc as (
    select d.id from public.documentos d where d.licitacion_id in (select id from lic)
  )
  select jsonb_build_object(
    'formato', 'licitaai.export.v1',
    'generado_at', now(),
    'organization_id', p_org,

    'organizations',      (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.organizations t where t.id = p_org),
    'users',              (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.users t where t.organization_id = p_org),
    'empresa_perfil',     (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.empresa_perfil t where t.organization_id = p_org),
    'documentos_corporativos', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.documentos_corporativos t
                                where t.organization_id = p_org),
    'ai_org_policy',      (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.ai_org_policy t where t.organization_id = p_org),
    'ai_usage_log',       (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.ai_usage_log t where t.organization_id = p_org),
    'ai_budget_ledger',   (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.ai_budget_ledger t where t.organization_id = p_org),
    'invitaciones_staff', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.invitaciones_staff t where t.organization_id = p_org),
    'jobs',               (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.jobs t where t.organization_id = p_org),
    'jobs_dead_letter',   (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.jobs_dead_letter t where t.organization_id = p_org),
    'audit_log',          (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.audit_log t where t.organization_id = p_org),

    'licitaciones',       (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.licitaciones t where t.organization_id = p_org),
    'licitacion_jerarquia', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.licitacion_jerarquia t where t.licitacion_id in (select id from lic)),
    'documentos',         (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.documentos t where t.licitacion_id in (select id from lic)),
    'document_chunks',    (select coalesce(jsonb_agg(to_jsonb(t) - 'embedding'), '[]') from public.document_chunks t where t.documento_id in (select id from doc)),
    'partidas',           (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.partidas t where t.licitacion_id in (select id from lic)),
    'requisitos_tecnicos',(select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.requisitos_tecnicos t where t.licitacion_id in (select id from lic)),
    'propuesta_economica_config', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.propuesta_economica_config t where t.licitacion_id in (select id from lic)),
    'propuesta_economica_partidas', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.propuesta_economica_partidas t where t.licitacion_id in (select id from lic)),
    'propuestas',         (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.propuestas t where t.licitacion_id in (select id from lic)),
    'responsabilidades_procedimiento', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.responsabilidades_procedimiento t where t.licitacion_id in (select id from lic)),
    'viabilidad',         (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.viabilidad t where t.licitacion_id in (select id from lic)),
    'junta_aclaraciones', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.junta_aclaraciones t where t.licitacion_id in (select id from lic)),
    'checklist_items',    (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.checklist_items t where t.licitacion_id in (select id from lic)),
    'checklist_liberacion', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.checklist_liberacion t where t.licitacion_id in (select id from lic)),
    'analisis_bases',     (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.analisis_bases t where t.licitacion_id in (select id from lic)),
    'estudio_mercado',    (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.estudio_mercado t where t.licitacion_id in (select id from lic)),
    'seguimiento',        (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.seguimiento t where t.licitacion_id in (select id from lic)),
    'evidencia_envio',    (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.evidencia_envio t where t.licitacion_id in (select id from lic)),
    'actividad_log',      (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.actividad_log t where t.licitacion_id in (select id from lic)),
    'ai_results',         (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.ai_results t where t.organization_id = p_org),
    'ai_result_citations',(select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.ai_result_citations t
                           where t.ai_result_id in (select id from public.ai_results where organization_id = p_org))
  );
$$;

revoke all on function public.exportar_datos_organizacion(uuid) from public, anon, authenticated;
grant execute on function public.exportar_datos_organizacion(uuid) to service_role;

comment on function public.exportar_datos_organizacion(uuid) is
  'P2.6 — bundle jsonb con todos los datos de la organización (sin embeddings ni catálogos globales). Lo consume el job exportar-organizacion. Solo service_role.';

-- ── flag ───────────────────────────────────────────────────────────────
insert into public.feature_flags (key, descripcion) values
  ('datos.export_organizacion', 'P2.6 H4 — autoservicio de export de datos de la organización (ADMIN)')
on conflict (key) do nothing;
