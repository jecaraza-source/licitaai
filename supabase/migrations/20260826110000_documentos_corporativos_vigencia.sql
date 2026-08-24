-- Guarda la fecha de emisión detectada por IA en cada documento corporativo,
-- para poder calcular y mostrar si sigue vigente (documentos_corporativos.vigencia_hasta
-- ya existía pero nunca se llenaba desde la UI).
alter table public.documentos_corporativos
  add column if not exists fecha_emision date;
