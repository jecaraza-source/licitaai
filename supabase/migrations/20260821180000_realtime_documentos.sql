-- LicitaAI — Sprint 2: habilitar Realtime en documentos
-- Necesario para el tab de Documentos: notificar cuando un documento
-- termina de subir/procesarse (postgres_changes sobre licitacion_id).

alter publication supabase_realtime add table public.documentos;
