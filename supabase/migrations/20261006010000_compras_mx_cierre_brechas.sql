-- Compras MX · cierre de brechas de la auditoría (Pasos 1, 2, 3, 5, 12 y §28).
--
-- Todo aditivo (columnas nuevas, nullable o con default); no cambia
-- comportamiento existente.
--
-- 1) Paso 1/3 — licitaciones: unidad compradora, número interno, enlace a
--    Compras MX, fecha de cierre interno (anterior al límite oficial) y la
--    "acción interna" de cada evento crítico (jsonb: {fecha_x: "texto"}).
-- 2) Paso 2 — documentos.carpeta (taxonomía 01–11) y licitaciones.
--    expediente_fuente_completo (aviso "documentos de la fuente pendientes").
-- 3) Paso 5 — checklist_items.padre_id: requisitos compuestos como sub-ítems.
-- 4) §28 — checklist_items.cargado_compras_mx / coincide_compras_mx: las dos
--    últimas preguntas de trazabilidad por requisito (¿se cargó? ¿coincide?).
-- 5) Paso 12 — opciones de precio en la config económica y cantidad
--    mínima/máxima por partida; guardar_propuesta_economica las persiste.
--
-- Rollback (todas las columnas son nuevas):
--   alter table public.licitaciones
--     drop column unidad_compradora, drop column numero_interno,
--     drop column enlace_compras_mx, drop column fecha_cierre_interno,
--     drop column acciones_internas, drop column expediente_fuente_completo;
--   alter table public.documentos drop column carpeta;
--   alter table public.checklist_items
--     drop column padre_id, drop column cargado_compras_mx,
--     drop column coincide_compras_mx;
--   alter table public.propuesta_economica_config
--     drop column decimales, drop column precios_ajustables,
--     drop column vigencia_precios_dias, drop column descuentos,
--     drop column contrato_abierto, drop column importe_minimo,
--     drop column importe_maximo;
--   alter table public.propuesta_economica_partidas
--     drop column cantidad_minima, drop column cantidad_maxima;
--   (y restaurar guardar_propuesta_economica de 20260906000000_p1_integridad)

-- 1) Pasos 1, 2 y 3 — licitaciones
alter table public.licitaciones
  add column unidad_compradora text,
  add column numero_interno text,
  add column enlace_compras_mx text,
  add column fecha_cierre_interno timestamptz,
  add column acciones_internas jsonb not null default '{}'::jsonb,
  add column expediente_fuente_completo boolean not null default false;

alter table public.licitaciones
  add constraint licitaciones_acciones_internas_objeto
  check (jsonb_typeof(acciones_internas) = 'object');

-- 2) Paso 2 — carpeta del expediente por documento
alter table public.documentos add column carpeta text;
alter table public.documentos
  add constraint documentos_carpeta_check
  check (carpeta is null or carpeta in (
    '01_CONVOCATORIA', '02_ANEXO_TECNICO', '03_FORMATOS', '04_ACLARACIONES',
    '05_LEGAL_ADMINISTRATIVO', '06_PROPUESTA_TECNICA', '07_PROPUESTA_ECONOMICA',
    '08_COMPRASMX', '09_PROPUESTA_FINAL', '10_ACUSES_EVIDENCIAS', '11_FALLO_CONTRATO'
  ));

-- 3) Paso 5 y §28 — checklist_items
alter table public.checklist_items
  add column padre_id uuid references public.checklist_items(id) on delete cascade,
  add column cargado_compras_mx boolean not null default false,
  add column coincide_compras_mx boolean not null default false;

alter table public.checklist_items
  add constraint checklist_items_no_autopadre check (padre_id is distinct from id);

create index checklist_items_padre_idx on public.checklist_items (padre_id)
  where padre_id is not null;

-- El padre debe ser de la misma licitación y no ser a su vez un sub-ítem
-- (un solo nivel: "5 especialistas → CV → comprobante" son hijos del mismo
-- requisito compuesto).
create or replace function public._checklist_padre_valido()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_lic uuid;
  v_abuelo uuid;
begin
  if new.padre_id is null then
    return new;
  end if;
  select licitacion_id, padre_id into v_lic, v_abuelo
    from public.checklist_items where id = new.padre_id;
  if v_lic is null or v_lic is distinct from new.licitacion_id then
    raise exception 'padre_id % no pertenece a la licitación %', new.padre_id, new.licitacion_id
      using errcode = 'check_violation';
  end if;
  if v_abuelo is not null then
    raise exception 'un sub-ítem no puede tener sub-ítems' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger checklist_items_padre_valido
  before insert or update of padre_id, licitacion_id on public.checklist_items
  for each row execute function public._checklist_padre_valido();

-- 4) Paso 12 — opciones de precio
alter table public.propuesta_economica_config
  add column decimales smallint not null default 2 check (decimales between 0 and 6),
  add column precios_ajustables boolean not null default false,
  add column vigencia_precios_dias integer check (vigencia_precios_dias is null or vigencia_precios_dias > 0),
  add column descuentos text,
  add column contrato_abierto boolean not null default false,
  add column importe_minimo numeric check (importe_minimo is null or importe_minimo >= 0),
  add column importe_maximo numeric check (importe_maximo is null or importe_maximo >= 0);

alter table public.propuesta_economica_config
  add constraint propuesta_economica_importes_orden
  check (importe_minimo is null or importe_maximo is null or importe_minimo <= importe_maximo);

alter table public.propuesta_economica_partidas
  add column cantidad_minima numeric check (cantidad_minima is null or cantidad_minima >= 0),
  add column cantidad_maxima numeric check (cantidad_maxima is null or cantidad_maxima >= 0);

alter table public.propuesta_economica_partidas
  add constraint propuesta_economica_partidas_cantidades_orden
  check (cantidad_minima is null or cantidad_maxima is null or cantidad_minima <= cantidad_maxima);

-- guardar_propuesta_economica: igual que la versión de 20260906000000 más las
-- columnas nuevas. Las nuevas se conservan (coalesce) cuando el cliente no
-- las envía, para no borrarlas con un cliente anterior.
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
      condiciones_pago, tiempo_entrega_dias, validez_oferta_dias,
      decimales, precios_ajustables, vigencia_precios_dias, descuentos,
      contrato_abierto, importe_minimo, importe_maximo
    )
    values (
      p_licitacion_id,
      p_config->>'tipo_precio',
      coalesce((p_config->>'incluye_iva')::boolean, true),
      coalesce(p_config->>'moneda', 'MXN'),
      p_config->>'condiciones_pago',
      (p_config->>'tiempo_entrega_dias')::integer,
      (p_config->>'validez_oferta_dias')::integer,
      coalesce((p_config->>'decimales')::smallint, 2),
      coalesce((p_config->>'precios_ajustables')::boolean, false),
      (p_config->>'vigencia_precios_dias')::integer,
      p_config->>'descuentos',
      coalesce((p_config->>'contrato_abierto')::boolean, false),
      (p_config->>'importe_minimo')::numeric,
      (p_config->>'importe_maximo')::numeric
    )
    on conflict (licitacion_id) do update set
      tipo_precio = coalesce(excluded.tipo_precio, public.propuesta_economica_config.tipo_precio),
      incluye_iva = coalesce(excluded.incluye_iva, public.propuesta_economica_config.incluye_iva),
      moneda = coalesce(excluded.moneda, public.propuesta_economica_config.moneda),
      condiciones_pago = excluded.condiciones_pago,
      tiempo_entrega_dias = excluded.tiempo_entrega_dias,
      validez_oferta_dias = excluded.validez_oferta_dias,
      decimales = case when p_config ? 'decimales' then excluded.decimales
                       else public.propuesta_economica_config.decimales end,
      precios_ajustables = case when p_config ? 'precios_ajustables' then excluded.precios_ajustables
                                else public.propuesta_economica_config.precios_ajustables end,
      vigencia_precios_dias = case when p_config ? 'vigencia_precios_dias' then excluded.vigencia_precios_dias
                                   else public.propuesta_economica_config.vigencia_precios_dias end,
      descuentos = case when p_config ? 'descuentos' then excluded.descuentos
                        else public.propuesta_economica_config.descuentos end,
      contrato_abierto = case when p_config ? 'contrato_abierto' then excluded.contrato_abierto
                              else public.propuesta_economica_config.contrato_abierto end,
      importe_minimo = case when p_config ? 'importe_minimo' then excluded.importe_minimo
                            else public.propuesta_economica_config.importe_minimo end,
      importe_maximo = case when p_config ? 'importe_maximo' then excluded.importe_maximo
                            else public.propuesta_economica_config.importe_maximo end;
  end if;

  if p_partidas is not null then
    delete from public.propuesta_economica_partidas where licitacion_id = p_licitacion_id;

    insert into public.propuesta_economica_partidas (
      licitacion_id, partida_id, descripcion, cantidad, unidad,
      precio_unitario_ofertado, subtotal, iva, total, margen_porcentaje,
      precio_referencia_mercado, cantidad_compras_mx,
      precio_unitario_compras_mx, total_compras_mx,
      cantidad_minima, cantidad_maxima
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
      (fila->>'total_compras_mx')::numeric,
      (fila->>'cantidad_minima')::numeric,
      (fila->>'cantidad_maxima')::numeric
    from jsonb_array_elements(p_partidas) as fila;
  end if;
end;
$$;

revoke all on function public.guardar_propuesta_economica(uuid, jsonb, jsonb) from anon;
revoke all on function public._checklist_padre_valido() from anon;
