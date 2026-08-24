-- Nombre de la persona física a la que pertenece el documento, cuando aplica
-- (titular de una identificación oficial, o apoderado/representante nombrado
-- en un poder o escrito de personalidad). Permite cruzar ambos documentos
-- para verificar que el representante legal coincide con su identificación.
alter table public.documentos_corporativos
  add column if not exists nombre_persona_detectado text;
