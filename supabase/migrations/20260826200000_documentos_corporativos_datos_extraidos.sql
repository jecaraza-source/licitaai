-- Datos legales estructurados que la IA extrae de cada documento
-- corporativo (número de escritura, notario, domicilio, etc.), según su
-- tipo. Se usan para prellenar Configuración > Datos legales y evitar
-- transcripción manual de datos oficiales (fuente de errores humanos).
-- Las claves coinciden 1:1 con columnas de empresa_perfil para que el
-- prellenado sea un merge directo.
alter table public.documentos_corporativos
  add column if not exists datos_extraidos_json jsonb not null default '{}'::jsonb;
