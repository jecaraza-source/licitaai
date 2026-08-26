-- Datos técnicos estructurados de la empresa, necesarios para generar los
-- documentos técnicos (TEC01-TEC08) de una propuesta: experiencia y
-- capacidad técnica, infraestructura y personal asignado, garantía técnica,
-- soporte y mantenimiento, licencias/permisos y tiempos de inicio del
-- servicio. Se capturan a mano en Configuración > Datos técnicos y se
-- reutilizan en cada generación, igual que los datos legales.

alter table public.empresa_perfil
  add column if not exists garantia_tecnica_meses integer,
  add column if not exists garantia_tecnica_detalle text,
  add column if not exists soporte_tecnico_contacto text,
  add column if not exists tiempo_inicio_servicio_dias integer,
  add column if not exists personal_tecnico_json jsonb not null default '[]'::jsonb,
  add column if not exists infraestructura_equipo_json jsonb not null default '[]'::jsonb,
  add column if not exists licencias_permisos_json jsonb not null default '[]'::jsonb;
