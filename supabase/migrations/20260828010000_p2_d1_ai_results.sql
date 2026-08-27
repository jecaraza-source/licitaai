-- P2 · D1–D3 — versionado y trazabilidad de resultados de IA (ADR 0006).
--
-- ai_results es el registro CANÓNICO append-only de toda salida de IA.
-- Nunca se hace UPDATE de resultado_json: una corrección/re-análisis es una
-- fila nueva con reemplaza_a apuntando a la anterior. Las tablas de dominio
-- (analisis_bases, estudio_mercado, …) conservan sus columnas para no
-- romper las lecturas actuales y ganan un puntero ai_result_id al resultado
-- activo (el más reciente APROBADO, o el más reciente si ninguno lo está).
--
-- prompt_templates saca los prompts del código (versionados). RLS: sin
-- política de lectura para authenticated — son IP; solo el worker
-- (service_role) los lee. El dashboard de consumo (C7) nunca los expone.
--
-- ai_result_citations enlaza cada afirmación de IA con los chunks de
-- evidencia que la respaldan.
--
-- Rollback:
--   alter table public.analisis_bases   drop column if exists ai_result_id;
--   alter table public.estudio_mercado  drop column if exists ai_result_id;
--   drop function if exists public.persistir_resultado_ia(uuid,text,uuid,uuid,text,text,text,text,text,integer,integer,numeric,integer,jsonb,text,boolean,uuid,jsonb);
--   drop function if exists public.aprobar_resultado_ia(uuid,text);
--   drop table if exists public.ai_result_citations;
--   drop table if exists public.ai_results;
--   drop table if exists public.prompt_templates;

-- ============================================================================
-- prompt_templates
-- ============================================================================
create table public.prompt_templates (
  id text not null,
  version integer not null default 1,
  nombre text not null,
  cuerpo text not null,
  esquema_salida_json jsonb,
  modelo_sugerido text,
  params_json jsonb not null default '{}'::jsonb,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (id, version)
);

alter table public.prompt_templates enable row level security;
-- Sin política: inaccesible para authenticated/anon. Solo service_role.

comment on table public.prompt_templates is
  'Prompts de sistema versionados (P2.3, ADR 0006). Cambiar un prompt = nueva version, nunca edición in-place. conGuardia() (anti prompt-injection) se sigue aplicando encima en el handler.';

-- Seed: los prompts actuales, tal como viven hoy en las Edge Functions /
-- rutas, como version 1. Los handlers de Fase B los referenciarán por
-- (id, version) al migrarse.
insert into public.prompt_templates (id, version, nombre, cuerpo, modelo_sugerido) values
  ('procesar-documento-extraccion', 1, 'Extracción de texto de PDF escaneado',
   'Este documento es un PDF escaneado. Extrae TODO el texto visible, tal como aparece, preservando la estructura de secciones, tablas y listas en formato de texto plano. No agregues comentarios ni resúmenes, solo el texto extraído.',
   'claude-sonnet-5'),
  ('preguntar-rag', 1, 'RAG Q&A sobre bases de licitación',
   'Eres un asistente experto en licitaciones públicas mexicanas. Responde la pregunta del usuario ÚNICAMENTE con base en los fragmentos de las bases de licitación proporcionados. Si la respuesta no está en los fragmentos, dilo explícitamente. Cita el número de fragmento entre corchetes, por ejemplo [Fragmento 2], cuando uses información de él.',
   'claude-sonnet-5')
on conflict (id, version) do nothing;

-- ============================================================================
-- ai_results — append-only.
-- ============================================================================
create table public.ai_results (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  recurso_tipo text not null,
  recurso_id uuid not null,
  documento_id uuid references public.documentos (id) on delete set null,
  documento_version integer,
  documento_sha256 text,
  tipo_analisis text not null,
  prompt_template_id text,
  prompt_version integer,
  provider text,
  modelo text,
  params_json jsonb not null default '{}'::jsonb,
  tokens_input integer,
  tokens_output integer,
  costo_usd numeric(14, 6),
  latencia_ms integer,
  resultado_json jsonb not null,
  nivel_confianza text check (nivel_confianza in ('ALTO', 'MEDIO', 'BAJO')),
  salida_incompleta boolean not null default false,
  estado_aprobacion text not null default 'PENDIENTE'
    check (estado_aprobacion in ('PENDIENTE', 'APROBADO', 'RECHAZADO')),
  aprobado_por uuid references public.users (id) on delete set null,
  aprobado_at timestamptz,
  reemplaza_a uuid references public.ai_results (id) on delete set null,
  reused_from uuid references public.ai_results (id) on delete set null,
  job_id uuid,
  origen text not null default 'worker'
    check (origen in ('worker', 'backfill_p2', 'manual')),
  created_at timestamptz not null default now()
);

create index ai_results_recurso_idx on public.ai_results (recurso_tipo, recurso_id, tipo_analisis, created_at desc);
create index ai_results_org_idx on public.ai_results (organization_id, created_at desc);
create index ai_results_documento_idx on public.ai_results (documento_id) where documento_id is not null;

alter table public.ai_results enable row level security;
create policy ai_results_select_own_org on public.ai_results
  for select using (organization_id = public.user_org_id());
-- Aprobación: los roles de escritura pueden cambiar SOLO el estado de
-- aprobación de un resultado de su organización (no resultado_json).
create policy ai_results_update_aprobacion on public.ai_results
  for update using (organization_id = public.user_org_id() and public.is_write_role())
  with check (organization_id = public.user_org_id());

comment on table public.ai_results is
  'Registro canónico append-only de resultados de IA (P2.3, ADR 0006). NUNCA se hace UPDATE de resultado_json — una corrección es una fila nueva con reemplaza_a. La política de UPDATE solo permite cambiar estado_aprobacion (validado en aprobar_resultado_ia).';

-- ============================================================================
-- ai_result_citations
-- ============================================================================
create table public.ai_result_citations (
  id uuid primary key default gen_random_uuid(),
  ai_result_id uuid not null references public.ai_results (id) on delete cascade,
  document_chunk_id uuid references public.document_chunks (id) on delete set null,
  documento_id uuid references public.documentos (id) on delete set null,
  pagina integer,
  seccion text,
  extracto text,
  score numeric(6, 4)
);

create index ai_result_citations_result_idx on public.ai_result_citations (ai_result_id);

alter table public.ai_result_citations enable row level security;
create policy ai_result_citations_select_own_org on public.ai_result_citations
  for select using (
    exists (
      select 1 from public.ai_results r
      where r.id = ai_result_id and r.organization_id = public.user_org_id()
    )
  );

-- ============================================================================
-- Punteros al resultado activo en las tablas de dominio (compatibilidad).
-- ============================================================================
alter table public.analisis_bases
  add column if not exists ai_result_id uuid references public.ai_results (id) on delete set null;
alter table public.estudio_mercado
  add column if not exists ai_result_id uuid references public.ai_results (id) on delete set null;

-- ============================================================================
-- persistir_resultado_ia — la vía de escritura que usarán los handlers de IA
-- de Fase B. Inserta la fila nueva, marca la anterior como reemplazada
-- (reemplaza_a), inserta las citas, y devuelve el id.
-- ============================================================================
create or replace function public.persistir_resultado_ia(
  p_organization_id uuid,
  p_recurso_tipo text,
  p_recurso_id uuid,
  p_documento_id uuid,
  p_documento_sha256 text,
  p_tipo_analisis text,
  p_prompt_template_id text,
  p_provider text,
  p_modelo text,
  p_tokens_input integer,
  p_tokens_output integer,
  p_costo_usd numeric,
  p_latencia_ms integer,
  p_resultado_json jsonb,
  p_nivel_confianza text,
  p_salida_incompleta boolean,
  p_job_id uuid,
  p_citas jsonb default '[]'::jsonb,
  p_prompt_version integer default 1
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_anterior uuid;
  v_id uuid;
  v_cita jsonb;
begin
  -- Resultado activo previo del mismo recurso + tipo (no RECHAZADO).
  select id into v_anterior from public.ai_results
   where organization_id = p_organization_id
     and recurso_tipo = p_recurso_tipo and recurso_id = p_recurso_id
     and tipo_analisis = p_tipo_analisis
     and coalesce(documento_id::text, '') = coalesce(p_documento_id::text, '')
     and estado_aprobacion <> 'RECHAZADO'
   order by created_at desc limit 1;

  insert into public.ai_results (
    organization_id, recurso_tipo, recurso_id, documento_id, documento_sha256,
    tipo_analisis, prompt_template_id, prompt_version, provider, modelo,
    tokens_input, tokens_output, costo_usd, latencia_ms, resultado_json,
    nivel_confianza, salida_incompleta, reemplaza_a, job_id, origen
  ) values (
    p_organization_id, p_recurso_tipo, p_recurso_id, p_documento_id, p_documento_sha256,
    p_tipo_analisis, p_prompt_template_id, p_prompt_version, p_provider, p_modelo,
    p_tokens_input, p_tokens_output, p_costo_usd, p_latencia_ms, p_resultado_json,
    p_nivel_confianza, coalesce(p_salida_incompleta, false), v_anterior, p_job_id, 'worker'
  )
  returning id into v_id;

  for v_cita in select * from jsonb_array_elements(coalesce(p_citas, '[]'::jsonb))
  loop
    insert into public.ai_result_citations
      (ai_result_id, document_chunk_id, documento_id, pagina, seccion, extracto, score)
    values (
      v_id,
      nullif(v_cita ->> 'document_chunk_id', '')::uuid,
      nullif(v_cita ->> 'documento_id', '')::uuid,
      nullif(v_cita ->> 'pagina', '')::integer,
      v_cita ->> 'seccion',
      v_cita ->> 'extracto',
      nullif(v_cita ->> 'score', '')::numeric
    );
  end loop;

  return v_id;
end;
$$;

-- ============================================================================
-- aprobar_resultado_ia — aprobación/rechazo humano (P2.3 D5). Valida que
-- solo cambia el estado, nunca el contenido.
-- ============================================================================
create or replace function public.aprobar_resultado_ia(
  p_result_id uuid,
  p_estado text
) returns public.ai_results
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.ai_results;
begin
  if auth.uid() is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;
  if p_estado not in ('APROBADO', 'RECHAZADO', 'PENDIENTE') then
    raise exception 'Estado inválido' using errcode = '22023';
  end if;

  update public.ai_results
     set estado_aprobacion = p_estado,
         aprobado_por = case when p_estado = 'PENDIENTE' then null else auth.uid() end,
         aprobado_at = case when p_estado = 'PENDIENTE' then null else now() end
   where id = p_result_id
     and organization_id = public.user_org_id()
     and public.is_write_role()
   returning * into v_row;

  if not found then
    raise exception 'Resultado no encontrado' using errcode = 'P0002';
  end if;
  return v_row;
end;
$$;

-- ============================================================================
-- GRANTS
-- ============================================================================
revoke all on function public.persistir_resultado_ia(uuid, text, uuid, uuid, text, text, text, text, text, integer, integer, numeric, integer, jsonb, text, boolean, uuid, jsonb, integer) from public;
revoke all on function public.aprobar_resultado_ia(uuid, text) from public;
grant execute on function public.persistir_resultado_ia(uuid, text, uuid, uuid, text, text, text, text, text, integer, integer, numeric, integer, jsonb, text, boolean, uuid, jsonb, integer) to service_role;
grant execute on function public.aprobar_resultado_ia(uuid, text) to authenticated;

-- ============================================================================
-- BACKFILL (D3) — analisis_bases y estudio_mercado -> ai_results.
-- origen='backfill_p2', estado_aprobacion='APROBADO' para no bloquear flujos
-- en curso; sin prompt_version ni hash de documento (no se guardaban).
-- Se marca en params_json que el detalle previo a P2 es incompleto (R10).
-- ============================================================================
with insertados as (
  insert into public.ai_results (
    organization_id, recurso_tipo, recurso_id, documento_id, tipo_analisis,
    resultado_json, nivel_confianza, estado_aprobacion, origen, created_at, params_json
  )
  select
    l.organization_id, 'licitacion', ab.licitacion_id, ab.documento_id, 'analisis_bases',
    jsonb_build_object(
      'objeto_contrato', ab.objeto_contrato,
      'tipo_procedimiento', ab.tipo_procedimiento,
      'monto_maximo_estimado', ab.monto_maximo_estimado,
      'moneda', ab.moneda,
      'fechas', ab.fechas_json,
      'requisitos_legales', ab.requisitos_legales_json,
      'documentacion_requerida', ab.documentacion_requerida_json,
      'criterios_evaluacion', ab.criterios_evaluacion_json,
      'garantias', ab.garantias_json,
      'forma_presentacion', ab.forma_presentacion,
      'notas', ab.notas_json
    ),
    ab.nivel_confianza, 'APROBADO', 'backfill_p2', ab.created_at,
    jsonb_build_object('backfill', true, 'nota', 'trazabilidad incompleta (previo a P2)')
  from public.analisis_bases ab
  join public.licitaciones l on l.id = ab.licitacion_id
  where ab.ai_result_id is null
  returning id, recurso_id, documento_id
)
update public.analisis_bases ab
   set ai_result_id = i.id
  from insertados i
 where ab.licitacion_id = i.recurso_id
   and coalesce(ab.documento_id::text, '') = coalesce(i.documento_id::text, '')
   and ab.ai_result_id is null;

with insertados as (
  insert into public.ai_results (
    organization_id, recurso_tipo, recurso_id, tipo_analisis,
    resultado_json, nivel_confianza, estado_aprobacion, origen, created_at, params_json
  )
  select
    l.organization_id, 'licitacion', em.licitacion_id, 'estudio_mercado',
    jsonb_build_object(
      'partida_id', em.partida_id,
      'precio_minimo', em.precio_minimo,
      'precio_maximo', em.precio_maximo,
      'precio_promedio', em.precio_promedio,
      'precio_recomendado', em.precio_recomendado,
      'fuentes', em.fuentes_json,
      'observaciones', em.observaciones
    ),
    em.nivel_confianza, 'APROBADO', 'backfill_p2', em.created_at,
    jsonb_build_object('backfill', true, 'estudio_mercado_id', em.id)
  from public.estudio_mercado em
  join public.licitaciones l on l.id = em.licitacion_id
  where em.ai_result_id is null
  returning id, (params_json ->> 'estudio_mercado_id')::uuid as em_id
)
update public.estudio_mercado em
   set ai_result_id = i.id
  from insertados i
 where em.id = i.em_id and em.ai_result_id is null;
