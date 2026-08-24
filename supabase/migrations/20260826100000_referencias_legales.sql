-- LicitaAI — Referencias legales: catálogo de leyes/reglamentos aplicables a
-- licitaciones públicas, con búsqueda de texto completo y RAG (embeddings)
-- para el asistente de IA que cita artículos.
--
-- Es contenido global compartido entre organizaciones (como estados_config):
-- de solo lectura para cualquier usuario autenticado; el contenido se carga
-- de forma curada (migraciones / service role), no por los usuarios finales.

-- ============================================================================
-- CATÁLOGO
-- ============================================================================
create table public.referencias_legales (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  nombre_completo text not null,
  tipo text not null default 'LEY' check (tipo in ('LEY', 'REGLAMENTO', 'LINEAMIENTO', 'CODIGO')),
  ambito text not null default 'FEDERAL' check (ambito in ('FEDERAL', 'EDOMEX', 'CDMX', 'GENERAL')),
  descripcion text,
  url_oficial text,
  orden integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.referencia_legal_documentos (
  id uuid primary key default gen_random_uuid(),
  referencia_legal_id uuid not null references public.referencias_legales (id) on delete cascade,
  nombre text not null,
  storage_path text not null,
  procesado boolean not null default false,
  procesado_at timestamptz,
  created_at timestamptz not null default now()
);

create index referencia_legal_documentos_referencia_id_idx
  on public.referencia_legal_documentos (referencia_legal_id);

create table public.referencia_legal_chunks (
  id uuid primary key default gen_random_uuid(),
  referencia_documento_id uuid not null references public.referencia_legal_documentos (id) on delete cascade,
  chunk_index integer not null,
  contenido text not null,
  articulo text,
  embedding vector(1536),
  metadata_json jsonb default '{}'::jsonb
);

create index referencia_legal_chunks_documento_id_idx
  on public.referencia_legal_chunks (referencia_documento_id);
create index referencia_legal_chunks_embedding_idx on public.referencia_legal_chunks
  using hnsw (embedding vector_cosine_ops);
create index referencia_legal_chunks_contenido_fts_idx on public.referencia_legal_chunks
  using gin (to_tsvector('spanish', contenido));

-- ============================================================================
-- RLS — catálogo global de solo lectura para cualquier usuario autenticado
-- ============================================================================
alter table public.referencias_legales enable row level security;
alter table public.referencia_legal_documentos enable row level security;
alter table public.referencia_legal_chunks enable row level security;

create policy "referencias_legales_select_authenticated" on public.referencias_legales
  for select using (auth.role() = 'authenticated');

create policy "referencia_legal_documentos_select_authenticated" on public.referencia_legal_documentos
  for select using (auth.role() = 'authenticated');

create policy "referencia_legal_chunks_select_authenticated" on public.referencia_legal_chunks
  for select using (auth.role() = 'authenticated');

-- ============================================================================
-- Búsqueda de texto completo (motor de búsqueda por palabra clave)
-- ============================================================================
create or replace function public.buscar_referencias_texto(
  query_text text,
  referencia_legal_id_param uuid default null,
  match_count int default 15
)
returns table (
  chunk_id uuid,
  contenido text,
  articulo text,
  rank float,
  referencia_legal_id uuid,
  referencia_nombre text,
  referencia_nombre_completo text,
  referencia_documento_id uuid
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    rc.id as chunk_id,
    rc.contenido,
    rc.articulo,
    ts_rank(to_tsvector('spanish', rc.contenido), websearch_to_tsquery('spanish', query_text)) as rank,
    rl.id as referencia_legal_id,
    rl.nombre as referencia_nombre,
    rl.nombre_completo as referencia_nombre_completo,
    rd.id as referencia_documento_id
  from public.referencia_legal_chunks rc
  join public.referencia_legal_documentos rd on rd.id = rc.referencia_documento_id
  join public.referencias_legales rl on rl.id = rd.referencia_legal_id
  where to_tsvector('spanish', rc.contenido) @@ websearch_to_tsquery('spanish', query_text)
    and (referencia_legal_id_param is null or rl.id = referencia_legal_id_param)
  order by rank desc
  limit match_count;
$$;

revoke execute on function public.buscar_referencias_texto(text, uuid, int) from public, anon;
grant execute on function public.buscar_referencias_texto(text, uuid, int) to authenticated, service_role;

-- ============================================================================
-- Búsqueda semántica (RAG para el asistente de IA)
-- ============================================================================
create or replace function public.search_referencia_chunks(
  query_embedding vector(1536),
  match_count int default 8,
  referencia_legal_id_param uuid default null
)
returns table (
  contenido text,
  articulo text,
  similarity float,
  referencia_legal_id uuid,
  referencia_nombre text,
  referencia_nombre_completo text,
  referencia_documento_id uuid
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    rc.contenido,
    rc.articulo,
    1 - (rc.embedding <=> query_embedding) as similarity,
    rl.id as referencia_legal_id,
    rl.nombre as referencia_nombre,
    rl.nombre_completo as referencia_nombre_completo,
    rd.id as referencia_documento_id
  from public.referencia_legal_chunks rc
  join public.referencia_legal_documentos rd on rd.id = rc.referencia_documento_id
  join public.referencias_legales rl on rl.id = rd.referencia_legal_id
  where rc.embedding is not null
    and (referencia_legal_id_param is null or rl.id = referencia_legal_id_param)
  order by rc.embedding <=> query_embedding
  limit match_count;
$$;

revoke execute on function public.search_referencia_chunks(vector, int, uuid) from public, anon;
grant execute on function public.search_referencia_chunks(vector, int, uuid) to authenticated, service_role;

-- ============================================================================
-- Storage bucket — PDFs/textos oficiales fuente (privado, gestión curada)
-- ============================================================================
insert into storage.buckets (id, name, public, file_size_limit)
values ('referencias-legales', 'referencias-legales', false, 52428800)
on conflict (id) do nothing;

create policy "referencias_legales_bucket_select_authenticated" on storage.objects
  for select using (bucket_id = 'referencias-legales' and auth.role() = 'authenticated');

-- ============================================================================
-- Catálogo inicial — leyes y reglamentos aplicables a licitaciones públicas
-- en México (federal y las jurisdicciones que soporta la app: EDOMEX, CDMX).
-- ============================================================================
insert into public.referencias_legales (nombre, nombre_completo, tipo, ambito, descripcion, url_oficial, orden) values
  ('LAASSP', 'Ley de Adquisiciones, Arrendamientos y Servicios del Sector Público', 'LEY', 'FEDERAL',
   'Marco federal para procedimientos de adquisición de bienes y contratación de servicios (licitación pública, invitación a cuando menos tres personas, adjudicación directa).',
   'https://www.diputados.gob.mx/LeyesBiblio/pdf/LAASSP.pdf', 10),
  ('RLAASSP', 'Reglamento de la Ley de Adquisiciones, Arrendamientos y Servicios del Sector Público', 'REGLAMENTO', 'FEDERAL',
   'Disposiciones reglamentarias de la LAASSP: requisitos de las propuestas, criterios de evaluación, garantías, plazos.',
   'https://www.diputados.gob.mx/LeyesBiblio/regley/Reg_LAASSP.pdf', 20),
  ('LOPSRM', 'Ley de Obras Públicas y Servicios Relacionados con las Mismas', 'LEY', 'FEDERAL',
   'Marco federal para la contratación de obra pública y servicios relacionados con la misma.',
   'https://www.diputados.gob.mx/LeyesBiblio/pdf/LOPSRM.pdf', 30),
  ('RLOPSRM', 'Reglamento de la Ley de Obras Públicas y Servicios Relacionados con las Mismas', 'REGLAMENTO', 'FEDERAL',
   'Disposiciones reglamentarias de la LOPSRM.',
   'https://www.diputados.gob.mx/LeyesBiblio/regley/Reg_LOPSRM.pdf', 40),
  ('LGRA', 'Ley General de Responsabilidades Administrativas', 'LEY', 'FEDERAL',
   'Régimen de responsabilidades administrativas de servidores públicos y particulares vinculados con faltas graves en contrataciones públicas. Desde 2016 absorbe la materia que regulaba la ya abrogada Ley Federal Anticorrupción en Contrataciones Públicas.',
   'https://www.diputados.gob.mx/LeyesBiblio/pdf/LGRA.pdf', 50),
  ('LCPEMM', 'Ley de Contratación Pública del Estado de México y Municipios', 'LEY', 'EDOMEX',
   'Marco estatal para adquisiciones, arrendamientos, servicios y obra pública en el Estado de México y sus municipios.',
   'https://legislacion.edomex.gob.mx/sites/legislacion.edomex.gob.mx/files/files/pdf/ley/vig/leyvig192.pdf', 60),
  ('LADF', 'Ley de Adquisiciones para el Distrito Federal', 'LEY', 'CDMX',
   'Marco de adquisiciones, arrendamientos y prestación de servicios para los entes públicos de la Ciudad de México (conserva el nombre "Distrito Federal" pese al cambio de denominación de la entidad).',
   'https://www.congresocdmx.gob.mx/archivos/transparencia/LEY_DE_ADQUISICIONES_PARA_EL_DISTRITO_FEDERAL.pdf', 70),
  ('LOPCDMX', 'Ley de Obras Públicas de la Ciudad de México', 'LEY', 'CDMX',
   'Marco de obra pública y servicios relacionados para los entes públicos de la Ciudad de México.',
   'https://www.congresocdmx.gob.mx/media/documentos/38c13e71935db5228b3f88d476c2ce79b3571f65.pdf', 80)
on conflict do nothing;
