-- P2 · F — instrumentación y límites de rendimiento (P2.4, ADR sin ADR
-- propio; ver docs/p2/11-rendimiento.md).
--
-- "Medir antes de optimizar": esta migración instrumenta y pone límites
-- seguros; las optimizaciones con impacto medible (índices por plan real,
-- ef_search calibrado) se harán con datos de producción.
--
-- Rollback:
--   drop index if exists public.document_chunks_pendientes_idx;
--   drop index if exists public.documentos_licitacion_procesado_idx;
--   -- pg_stat_statements: se deja (es solo lectura, no molesta);
--   -- search_chunks: revertir los SET (ver 20260826150000).

-- ============================================================================
-- Observabilidad de consultas lentas (F1). Extensión estándar de Supabase;
-- se consulta desde `pg_stat_statements` (Studio → Reports → Query Performance).
-- ============================================================================
create extension if not exists pg_stat_statements;

-- ============================================================================
-- Índices por patrones de consulta introducidos en P2.
-- ============================================================================

-- B1 step "embeddings": document_chunks where documento_id = ? and embedding is null.
create index if not exists document_chunks_pendientes_idx
  on public.document_chunks (documento_id)
  where embedding is null;

-- analizar-bases / generar-preguntas-junta: conteo de chunks procesados por
-- licitación (join document_chunks → documentos por licitacion_id + procesado).
create index if not exists documentos_licitacion_procesado_idx
  on public.documentos (licitacion_id)
  where procesado = true;

-- ============================================================================
-- search_chunks (F5) — límites explícitos:
--   - statement_timeout 5s: acota un escaneo vectorial que se dispare.
--   - hnsw.ef_search: se deja en el default de pgvector (40). NO se fija a
--     nivel de función con `SET hnsw.ef_search` porque el pooler de sesión
--     de Supabase (Supavisor) rechaza `SET` sobre GUCs de extensión al
--     crear la función ("permission denied to set parameter"). Para
--     calibrarlo (F5, pendiente de datos de recall): `ALTER DATABASE
--     postgres SET hnsw.ef_search = N` desde el dashboard, o convertir
--     esta función a plpgsql con `SET LOCAL` en el cuerpo.
-- ============================================================================
create or replace function public.search_chunks(
  query_embedding vector(1536),
  licitacion_id_param uuid,
  match_count int default 5,
  documento_id_param uuid default null
)
returns table (
  contenido text,
  similarity float,
  documento_id uuid
)
language sql
stable
security definer
set search_path = public, extensions
set statement_timeout = '5s'
as $$
  select
    dc.contenido,
    1 - (dc.embedding <=> query_embedding) as similarity,
    dc.documento_id
  from public.document_chunks dc
  join public.documentos d on d.id = dc.documento_id
  where d.licitacion_id = licitacion_id_param
    and dc.embedding is not null
    and (documento_id_param is null or dc.documento_id = documento_id_param)
    and (
      public.licitacion_org_matches(licitacion_id_param)
      or auth.role() = 'service_role'
    )
  order by dc.embedding <=> query_embedding
  limit greatest(1, least(coalesce(match_count, 5), 50));
$$;

revoke execute on function public.search_chunks(vector, uuid, int, uuid) from public, anon;
grant execute on function public.search_chunks(vector, uuid, int, uuid) to authenticated, service_role;

-- ============================================================================
-- Límite de tiempo en las funciones de reporte agregado (no deben poder
-- colgar una request si hay muchos datos).
-- ============================================================================
alter function public.metricas_operacion() set statement_timeout = '10s';
alter function public.presupuesto_ia_disponible(uuid) set statement_timeout = '5s';

-- Helpers de introspección para los tests/CI (service_role).
create or replace function public.indices_existen(p_nombres text[])
returns boolean language sql security definer stable set search_path = public as $$
  select coalesce(bool_and(exists (
    select 1 from pg_indexes where schemaname = 'public' and indexname = n
  )), false) from unnest(p_nombres) n;
$$;
create or replace function public.extension_existe(p_nombre text)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from pg_extension where extname = p_nombre);
$$;
revoke all on function public.indices_existen(text[]) from public, anon, authenticated;
revoke all on function public.extension_existe(text) from public, anon, authenticated;
grant execute on function public.indices_existen(text[]) to service_role;
grant execute on function public.extension_existe(text) to service_role;
