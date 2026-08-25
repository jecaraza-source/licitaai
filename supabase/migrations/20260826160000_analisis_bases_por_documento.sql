-- LicitaAI: hasta ahora "Analizar bases con IA" borraba y reemplazaba el
-- único análisis guardado de la licitación sin importar qué documento se
-- hubiera elegido en el selector — analizar un segundo documento destruía
-- el análisis del primero sin aviso. Ahora se guarda un análisis por
-- combinación (licitación, documento específico o "todos los documentos"),
-- para poder conservar varios y volver a mostrarlos sin tener que
-- reanalizar, y para poder preguntar antes de sobreescribir uno existente.

alter table public.analisis_bases
  add column if not exists documento_id uuid references public.documentos (id) on delete cascade;

-- Un análisis por (licitación, documento específico).
create unique index if not exists analisis_bases_licitacion_documento_idx
  on public.analisis_bases (licitacion_id, documento_id)
  where documento_id is not null;

-- Un análisis por licitación para el caso "todos los documentos" (documento_id null).
create unique index if not exists analisis_bases_licitacion_todos_idx
  on public.analisis_bases (licitacion_id)
  where documento_id is null;

comment on column public.analisis_bases.documento_id is
  'Documento específico analizado, o null si el análisis fue sobre "todos los documentos" de la licitación.';
