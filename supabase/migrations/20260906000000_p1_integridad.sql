-- P1.2 — Integridad y transacciones.
--
-- 1. guardar_propuesta_economica(): reemplaza el patrón delete-then-insert
--    sin transacción de PUT /api/licitaciones/[id]/propuesta-economica por
--    una sola función (implícitamente transaccional en Postgres) — si el
--    insert de partidas falla, el delete previo se revierte y no se pierde
--    lo capturado. SECURITY INVOKER: la RLS de las tablas sigue aplicando
--    contra el llamante.
-- 2. Triggers de consistencia cross-recurso dentro de la misma
--    organización: un documento_id / partida_id referenciado debe
--    pertenecer a la MISMA licitación que la fila que lo referencia. La RLS
--    ya impide el acceso cross-organización; esto cierra el hueco
--    cross-recurso dentro de una organización (documentado en
--    docs/api-contracts.md, hallazgo transversal #5).
-- 3. Índices para los patrones de consulta que hoy hacen scan secuencial.
--
-- Rollback:
--   drop function if exists public.guardar_propuesta_economica(uuid, jsonb, jsonb);
--   drop trigger if exists trg_pe_partida_misma_licitacion on public.propuesta_economica_partidas;
--   drop trigger if exists trg_checklist_doc_misma_licitacion on public.checklist_items;
--   drop trigger if exists trg_req_tecnico_doc_misma_licitacion on public.requisitos_tecnicos;
--   drop function if exists public._partida_pertenece_a_licitacion();
--   drop function if exists public._documento_pertenece_a_licitacion();
--   drop index if exists public.checklist_items_documento_id_idx;
--   drop index if exists public.requisitos_tecnicos_licitacion_id_idx;
--   drop index if exists public.requisitos_tecnicos_documento_id_idx;
--   drop index if exists public.propuesta_economica_partidas_partida_id_idx;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Guardado atómico de la propuesta económica
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.guardar_propuesta_economica(
  p_licitacion_id uuid,
  p_config jsonb default null,
  p_partidas jsonb default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_config is not null then
    insert into public.propuesta_economica_config (
      licitacion_id, tipo_precio, incluye_iva, moneda,
      condiciones_pago, tiempo_entrega_dias, validez_oferta_dias
    )
    values (
      p_licitacion_id,
      p_config->>'tipo_precio',
      coalesce((p_config->>'incluye_iva')::boolean, true),
      coalesce(p_config->>'moneda', 'MXN'),
      p_config->>'condiciones_pago',
      (p_config->>'tiempo_entrega_dias')::integer,
      (p_config->>'validez_oferta_dias')::integer
    )
    on conflict (licitacion_id) do update set
      tipo_precio = coalesce(excluded.tipo_precio, public.propuesta_economica_config.tipo_precio),
      incluye_iva = coalesce(excluded.incluye_iva, public.propuesta_economica_config.incluye_iva),
      moneda = coalesce(excluded.moneda, public.propuesta_economica_config.moneda),
      condiciones_pago = excluded.condiciones_pago,
      tiempo_entrega_dias = excluded.tiempo_entrega_dias,
      validez_oferta_dias = excluded.validez_oferta_dias;
  end if;

  if p_partidas is not null then
    delete from public.propuesta_economica_partidas where licitacion_id = p_licitacion_id;

    insert into public.propuesta_economica_partidas (
      licitacion_id, partida_id, descripcion, cantidad, unidad,
      precio_unitario_ofertado, subtotal, iva, total, margen_porcentaje,
      precio_referencia_mercado, cantidad_compras_mx,
      precio_unitario_compras_mx, total_compras_mx
    )
    select
      p_licitacion_id,
      nullif(fila->>'partida_id', '')::uuid,
      coalesce(fila->>'descripcion', ''),
      (fila->>'cantidad')::numeric,
      fila->>'unidad',
      (fila->>'precio_unitario_ofertado')::numeric,
      (fila->>'subtotal')::numeric,
      (fila->>'iva')::numeric,
      (fila->>'total')::numeric,
      (fila->>'margen_porcentaje')::numeric,
      (fila->>'precio_referencia_mercado')::numeric,
      (fila->>'cantidad_compras_mx')::numeric,
      (fila->>'precio_unitario_compras_mx')::numeric,
      (fila->>'total_compras_mx')::numeric
    from jsonb_array_elements(p_partidas) as fila;
  end if;
end;
$$;

comment on function public.guardar_propuesta_economica(uuid, jsonb, jsonb) is
  'P1.2 — upsert de config + reemplazo de partidas de la propuesta económica en una sola transacción. SECURITY INVOKER: respeta la RLS del llamante.';

revoke all on function public.guardar_propuesta_economica(uuid, jsonb, jsonb) from anon;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Consistencia cross-recurso: el recurso referenciado debe pertenecer a
--    la misma licitación
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public._documento_pertenece_a_licitacion()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_lic uuid;
begin
  if new.documento_id is null then
    return new;
  end if;
  select licitacion_id into v_lic from public.documentos where id = new.documento_id;
  if v_lic is null or v_lic is distinct from new.licitacion_id then
    raise exception 'documento_id % no pertenece a la licitación %', new.documento_id, new.licitacion_id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create or replace function public._partida_pertenece_a_licitacion()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_lic uuid;
begin
  if new.partida_id is null then
    return new;
  end if;
  select licitacion_id into v_lic from public.partidas where id = new.partida_id;
  if v_lic is null or v_lic is distinct from new.licitacion_id then
    raise exception 'partida_id % no pertenece a la licitación %', new.partida_id, new.licitacion_id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger trg_checklist_doc_misma_licitacion
  before insert or update of documento_id, licitacion_id on public.checklist_items
  for each row execute function public._documento_pertenece_a_licitacion();

create trigger trg_req_tecnico_doc_misma_licitacion
  before insert or update of documento_id, licitacion_id on public.requisitos_tecnicos
  for each row execute function public._documento_pertenece_a_licitacion();

create trigger trg_pe_partida_misma_licitacion
  before insert or update of partida_id, licitacion_id on public.propuesta_economica_partidas
  for each row execute function public._partida_pertenece_a_licitacion();

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Índices para patrones de consulta de la app
-- ────────────────────────────────────────────────────────────────────────────
create index if not exists checklist_items_documento_id_idx
  on public.checklist_items (documento_id) where documento_id is not null;

create index if not exists requisitos_tecnicos_licitacion_id_idx
  on public.requisitos_tecnicos (licitacion_id);

create index if not exists requisitos_tecnicos_documento_id_idx
  on public.requisitos_tecnicos (documento_id) where documento_id is not null;

create index if not exists propuesta_economica_partidas_partida_id_idx
  on public.propuesta_economica_partidas (partida_id) where partida_id is not null;
