-- LicitaAI — Sprint 3: búsqueda semántica sobre document_chunks

create or replace function public.search_chunks(
  query_embedding vector(1536),
  licitacion_id_param uuid,
  match_count int default 5
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
    and (
      public.licitacion_org_matches(licitacion_id_param)
      or auth.role() = 'service_role'
    )
  order by dc.embedding <=> query_embedding
  limit match_count;
$$;

revoke execute on function public.search_chunks(vector, uuid, int) from public, anon;
grant execute on function public.search_chunks(vector, uuid, int) to authenticated, service_role;
