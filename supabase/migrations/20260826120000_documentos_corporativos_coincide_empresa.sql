-- Marca si el RFC/razón social detectados en el documento coinciden con
-- los de la empresa activa a la que se está subiendo, para detectar
-- documentos cargados por error a la empresa equivocada.
-- true = coincide, false = no coincide, null = el documento no trae
-- RFC ni razón social para verificar (p. ej. comprobante de domicilio).
alter table public.documentos_corporativos
  add column if not exists coincide_empresa boolean;
