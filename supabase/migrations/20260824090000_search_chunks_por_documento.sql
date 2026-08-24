-- LicitaAI: permite acotar la búsqueda semántica de search_chunks a un solo
-- documento, para poder analizar con IA un documento específico en vez de
-- todos los de la licitación juntos.

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
  limit match_count;
$$;
