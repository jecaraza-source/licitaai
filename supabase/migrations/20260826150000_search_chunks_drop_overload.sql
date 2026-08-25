-- LicitaAI: 20260824090000_search_chunks_por_documento.sql agregó un
-- documento_id_param nuevo con `create or replace function`, pero como
-- Postgres identifica funciones por (nombre, tipos de argumentos), eso creó
-- un segundo overload en vez de reemplazar el original — dejando dos
-- funciones search_chunks coexistiendo. Cualquier llamada con solo 3
-- argumentos nombrados (query_embedding, licitacion_id_param, match_count)
-- vuelve ambigua para Postgres, porque también calza con el default null de
-- documento_id_param en el overload de 4 argumentos:
--   "Could not choose the best candidate function"
--
-- Se elimina el overload viejo de 3 argumentos: el de 4 argumentos ya cubre
-- el mismo comportamiento cuando documento_id_param es null.
drop function if exists public.search_chunks(vector, uuid, int);

-- La creación del overload de 4 argumentos nunca revocó los privilegios por
-- default de Postgres (EXECUTE a PUBLIC), así que quedó accesible también
-- para anon — a diferencia del original, que sí lo restringía.
revoke execute on function public.search_chunks(vector, uuid, int, uuid) from public, anon;
grant execute on function public.search_chunks(vector, uuid, int, uuid) to authenticated, service_role;
