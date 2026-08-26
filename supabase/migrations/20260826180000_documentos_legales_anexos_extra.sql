-- Campos adicionales para generar los anexos legales LEG13-LEG27 revisados
-- contra el expediente real de TCI (Anexo J MIPYME, Anexo N conflicto de
-- interés y Anexo H compromisos con la transparencia).

-- Estratificación MIPYME y socios/accionistas con su porcentaje, para el
-- Anexo "J" y el Anexo "N".
alter table public.empresa_perfil
  add column if not exists estratificacion_mipyme text,
  add column if not exists socios_accionistas_json jsonb not null default '[]'::jsonb;

-- Representante de la convocante que co-firma el Anexo "H" (Compromisos con
-- la Transparencia). Varía por licitación, no es un dato de la empresa.
alter table public.licitaciones
  add column if not exists convocante_representante_nombre text,
  add column if not exists convocante_representante_cargo text;
