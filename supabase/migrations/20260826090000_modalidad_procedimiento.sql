-- LicitaAI: modalidad del procedimiento (Abierta / Restringida / Invitación a
-- Cuando Menos Tres Personas), capturada desde la alta de la licitación para
-- poder guiar qué documentación de la convocante aplica en cada caso.

alter table public.licitaciones
  add column modalidad_procedimiento text
    check (modalidad_procedimiento in ('ABIERTA', 'RESTRINGIDA', 'INVITACION_TRES'));

comment on column public.licitaciones.modalidad_procedimiento is
  'Abierta (licitación pública), Restringida, o Invitación a Cuando Menos Tres Personas. Determina si aplican documentos de la convocante como la invitación a participar.';
