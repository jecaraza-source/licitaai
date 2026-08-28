-- P2 punch-list B12 — `set search_path` en las 3 trigger functions que el
-- advisor de Supabase marca como `function_search_path_mutable`.
--
-- Ninguna de las tres referencia una tabla por nombre sin calificar (solo
-- `raise exception` o `new.updated_at := now()`, y `now()` está en
-- `pg_catalog`, siempre en scope), así que `set search_path = ''` es
-- seguro y elimina el vector de que un `search_path` manipulado por el
-- llamante cambie a qué objeto resuelve un nombre dentro del trigger.
--
-- `pg_net` (advisor `extension_in_public`): sus funciones ya viven en el
-- schema `net` y se llaman calificadas (`net.http_post`); reubicar la
-- extensión es territorio de la plataforma Supabase y no aporta aquí —
-- se deja como está.
--
-- Rollback: recrear las 3 funciones sin la cláusula `set search_path`
--   (ver 20260901000000, 20260902000000, 20260904000000).

create or replace function public._audit_log_inmutable()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_log es inmutable: no se permite % ', tg_op;
end;
$$;

create or replace function public._retencion_archive_inmutable()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  raise exception 'retencion_archive es append-only (intento de % en id %)', tg_op, coalesce(old.id, -1);
end;
$$;

create or replace function public._deletion_requests_touch()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
