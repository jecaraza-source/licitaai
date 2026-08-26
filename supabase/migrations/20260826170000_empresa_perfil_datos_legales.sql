-- Datos legales estructurados de la empresa, necesarios para generar los
-- anexos legales (LEG01-LEG12) de una propuesta: acreditación de existencia
-- legal, domicilio, nacionalidad, normas oficiales mexicanas, discapacidad,
-- etc. La IA de análisis de documentos corporativos no extrae estos campos
-- (solo fecha_emision/coincide_empresa/nombre_persona_detectado), así que se
-- capturan a mano en Configuración > Datos legales y se reutilizan en cada
-- generación.

-- Acta constitutiva
alter table public.empresa_perfil
  add column if not exists objeto_social text,
  add column if not exists acta_escritura_numero text,
  add column if not exists acta_escritura_fecha date,
  add column if not exists acta_notario text,
  add column if not exists acta_notaria_numero text,
  add column if not exists acta_notaria_estado text,
  add column if not exists acta_registro_publico text;

-- Representante legal (puede tener un poder distinto al acta constitutiva)
alter table public.empresa_perfil
  add column if not exists representante_legal_nombre text,
  add column if not exists representante_legal_escritura_numero text,
  add column if not exists representante_legal_escritura_fecha date,
  add column if not exists representante_legal_notario text,
  add column if not exists representante_legal_notaria_numero text,
  add column if not exists representante_legal_notaria_estado text,
  add column if not exists representante_legal_registro_publico text;

-- Domicilio y contacto
alter table public.empresa_perfil
  add column if not exists domicilio_fiscal text,
  add column if not exists domicilio_notificaciones text,
  add column if not exists correo_notificaciones text;

-- Declaraciones estándar (LEG06/LEG07/LEG08)
alter table public.empresa_perfil
  add column if not exists nacionalidad text not null default 'Mexicana',
  add column if not exists normas_oficiales_aplican boolean not null default false,
  add column if not exists normas_oficiales_detalle text,
  add column if not exists cuenta_personal_discapacidad boolean not null default false;
