-- LicitaAI — P0.5: restringe los tipos MIME aceptados por cada bucket de
-- Storage a nivel de Supabase, no solo en el `accept` del <input> del
-- navegador (que un cliente puede ignorar por completo llamando a la API
-- de Storage directamente). El Content-Type que Storage compara contra
-- esta lista sigue siendo declarado por el cliente al subir — no es una
-- inspección real de magic bytes — pero cierra el caso más común (un
-- archivo con extensión/Content-Type que ni siquiera pretende ser del
-- tipo esperado) sin requerir enrutar cada subida por un endpoint propio.
-- La verificación real de magic bytes (inspección del contenido, no solo
-- del Content-Type declarado) vive en las Edge Functions que ya descargan
-- el archivo del lado del servidor para procesarlo — procesar-documento y
-- analizar-documento-corporativo — en vez de un endpoint aparte que un
-- cliente podría simplemente no llamar.

update storage.buckets set allowed_mime_types = array[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
] where id = 'documentos-originales';

update storage.buckets set allowed_mime_types = array[
  'application/pdf'
] where id = 'documentos-requeridos';

update storage.buckets set allowed_mime_types = array[
  'application/pdf',
  'image/jpeg',
  'image/png'
] where id = 'documentos-corporativos';

update storage.buckets set allowed_mime_types = array[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
] where id = 'propuestas-generadas';

update storage.buckets set allowed_mime_types = array[
  'image/png',
  'image/jpeg',
  'image/svg+xml',
  'image/webp'
] where id = 'logos-empresa';

-- El catálogo de leyes acepta PDF y texto plano (ver
-- procesar-referencia-legal/index.ts: usa pdf-parse si el nombre termina
-- en .pdf, o decodifica UTF-8 en cualquier otro caso).
update storage.buckets set allowed_mime_types = array[
  'application/pdf',
  'text/plain'
] where id = 'referencias-legales';
