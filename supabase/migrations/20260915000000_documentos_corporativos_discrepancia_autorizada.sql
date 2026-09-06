-- Permite al usuario confirmar explícitamente que un documento corresponde
-- a su empresa cuando coincide_empresa quedó en null (el documento no traía
-- RFC ni razón social para verificar automáticamente, p. ej. un comprobante
-- de domicilio sin RFC del titular o un poder que solo trae el RFC del
-- representante legal). null = sin decidir, true = el usuario confirmó que
-- el documento es correcto pese a no poder verificarlo.
alter table public.documentos_corporativos
  add column if not exists discrepancia_autorizada boolean;
