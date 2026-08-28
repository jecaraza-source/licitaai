-- P2 punch-list B3 (C5) — caché de resultados de IA + deduplicación de
-- embeddings por hash de contenido.
--
-- 1. `ai_cache`: caché GLOBAL (no por organización) de la salida de una
--    operación de IA, con clave = sha256(contenido) : prompt_template_id :
--    prompt_version : modelo. Es seguro compartir entre organizaciones
--    porque la clave incluye el hash del contenido: dos organizaciones que
--    analizan el MISMO documento (p. ej. las mismas bases públicas) con el
--    mismo prompt y modelo obtienen, por definición, el mismo resultado.
--    Solo `service_role` (el worker / las Edge Functions) la lee y escribe.
--
-- 2. Dedup de embeddings: `document_chunks.contenido_sha256` + índice.
--    Antes de pedir el embedding de un chunk, si ya existe otro chunk con
--    el mismo hash y embedding no nulo, se reutiliza su vector.
--
-- Ambas cosas se activan con el flag `ai.cache` (ya existente); sin él, el
-- código sigue llamando siempre al proveedor.
--
-- Rollback:
--   drop function if exists public.ai_cache_buscar(text);
--   drop function if exists public.ai_cache_guardar(text, jsonb, integer, integer);
--   drop function if exists public.embedding_por_hash(text);
--   drop table if exists public.ai_cache;
--   alter table public.document_chunks drop column if exists contenido_sha256;  -- safe: columna nueva, sin datos que preservar

-- ── 1. ai_cache ─────────────────────────────────────────────────────────
create table public.ai_cache (
  clave text primary key,          -- sha256:template:version:modelo
  resultado_json jsonb not null,
  tokens_input integer not null default 0,
  tokens_output integer not null default 0,
  hits integer not null default 0,
  created_at timestamptz not null default now(),
  last_hit_at timestamptz
);

comment on table public.ai_cache is
  'P2·B3 (C5) — caché global de salidas de IA por hash de contenido + prompt + modelo. Solo service_role. Se comparte entre organizaciones: la clave garantiza que la entrada es idéntica.';

create index ai_cache_last_hit_idx on public.ai_cache (coalesce(last_hit_at, created_at));

alter table public.ai_cache enable row level security;
-- Sin políticas: solo service_role (que bypassa RLS) la toca.

create or replace function public.ai_cache_buscar(p_clave text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  update public.ai_cache
     set hits = hits + 1, last_hit_at = now()
   where clave = p_clave
  returning resultado_json into v;
  return v;  -- null si no había entrada
end;
$$;

create or replace function public.ai_cache_guardar(
  p_clave text,
  p_resultado jsonb,
  p_tokens_input integer default 0,
  p_tokens_output integer default 0
) returns void
language sql
security definer
set search_path = public
as $$
  insert into public.ai_cache (clave, resultado_json, tokens_input, tokens_output)
  values (p_clave, p_resultado, coalesce(p_tokens_input, 0), coalesce(p_tokens_output, 0))
  on conflict (clave) do nothing;
$$;

revoke all on function public.ai_cache_buscar(text) from public, anon, authenticated;
revoke all on function public.ai_cache_guardar(text, jsonb, integer, integer) from public, anon, authenticated;
grant execute on function public.ai_cache_buscar(text) to service_role;
grant execute on function public.ai_cache_guardar(text, jsonb, integer, integer) to service_role;

-- ── 2. dedup de embeddings ──────────────────────────────────────────────
alter table public.document_chunks add column if not exists contenido_sha256 text;

-- Backfill: sha256 hex del contenido de los chunks existentes.
update public.document_chunks
   set contenido_sha256 = encode(digest(contenido, 'sha256'), 'hex')
 where contenido_sha256 is null;

create index if not exists document_chunks_sha256_idx
  on public.document_chunks (contenido_sha256)
  where embedding is not null;

-- Devuelve un embedding ya calculado para ese contenido (de cualquier
-- documento), o null. `stable`: no muta.
create or replace function public.embedding_por_hash(p_hash text)
returns vector
language sql
stable
security definer
set search_path = public
as $$
  select embedding
    from public.document_chunks
   where contenido_sha256 = p_hash and embedding is not null
   limit 1;
$$;

revoke all on function public.embedding_por_hash(text) from public, anon, authenticated;
grant execute on function public.embedding_por_hash(text) to service_role;
