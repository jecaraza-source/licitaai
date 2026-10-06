-- Compras MX · segunda ronda de brechas de la auditoría (Pasos 3 y 4, §28).
--
-- Todo aditivo (columnas nuevas, nullable o con default).
--
-- 1) Paso 3 — calendario crítico: faltaban 4 de los 10 eventos del proceso
--    operativo: límite de preguntas, entrega de muestras, firma de contrato
--    y trámite de garantía.
-- 2) Paso 4 — matriz de requisitos: columnas de control que faltaban:
--    subsanable (tri-estado: null = sin definir), requiere firma / membrete /
--    folio, y el campo de Compras MX asociado al requisito.
-- 3) §28 — trazabilidad: página de la fuente y página de la evidencia
--    ("Fuente, apartado y página" / "Archivo y página").
--
-- Rollback (todas las columnas son nuevas):
--   alter table public.licitaciones
--     drop column fecha_limite_preguntas, drop column fecha_entrega_muestras,
--     drop column fecha_firma_contrato, drop column fecha_garantia;
--   alter table public.checklist_items
--     drop column subsanable, drop column requiere_firma,
--     drop column requiere_membrete, drop column requiere_folio,
--     drop column campo_compras_mx, drop column pagina_fuente,
--     drop column pagina_evidencia;

alter table public.licitaciones
  add column fecha_limite_preguntas timestamptz,
  add column fecha_entrega_muestras timestamptz,
  add column fecha_firma_contrato timestamptz,
  add column fecha_garantia timestamptz;

alter table public.checklist_items
  add column subsanable boolean,
  add column requiere_firma boolean not null default false,
  add column requiere_membrete boolean not null default false,
  add column requiere_folio boolean not null default false,
  add column campo_compras_mx text,
  add column pagina_fuente text,
  add column pagina_evidencia text;
