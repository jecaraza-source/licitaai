-- LicitaAI — Sprint 1: seed de estados_config

insert into public.estados_config (estado_id, nombre_portal, url_portal, sistema_publicacion, requisitos_extra_json, instrucciones_carga)
values
  (
    'FEDERAL',
    'CompraNet',
    'https://compranet.hacienda.gob.mx',
    'COMPRANET',
    '["LAASSP Art. 29 y 34", "LOPSRM (obra pública)"]'::jsonb,
    'Las propuestas se cargan como sobres cifrados en CompraNet 5.0. Verificar firma electrónica avanzada vigente.'
  ),
  (
    'EDOMEX',
    'EDCA — Estado de México',
    null,
    'EDCA',
    '["Ley de Contratación Pública del Estado de México y Municipios"]'::jsonb,
    'Carga de documentos conforme a los lineamientos del sistema EDCA. Verificar requisitos específicos de la convocante.'
  ),
  (
    'CDMX',
    'SCA — Sistema de Compras CDMX',
    null,
    'SCA',
    '["Ley de Adquisiciones para el Distrito Federal"]'::jsonb,
    'Carga de documentos conforme al Sistema de Compras de la Ciudad de México (SCA).'
  )
on conflict (estado_id) do nothing;
