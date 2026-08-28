-- P2 punch-list B5 (D5) — gate duro de aprobación humana de resultados de IA.
--
-- Regla: una licitación no puede pasar a ENVIADA si tiene análisis de IA
-- ACTIVOS sin revisar (`estado_aprobacion = 'PENDIENTE'`). "Activo" = la
-- versión más reciente por (tipo_analisis, documento_id) — corrección = fila
-- nueva (D3), así que la más reciente es la vigente.
--
-- `APROBADO` y `RECHAZADO` ambos desbloquean: si el humano vio el análisis
-- y decidió no usarlo, también es una decisión. Solo `PENDIENTE` bloquea.
--
-- Se enforce en `POST /api/licitaciones/[id]/estado` (no en RLS: hace falta
-- un mensaje útil y un override de ADMIN logueado). El flag
-- `ai.gate_aprobacion` (OFF) lo activa por organización.
--
-- Rollback:
--   drop function if exists public.licitacion_analisis_ia_pendientes(uuid);
--   delete from public.feature_flags where key = 'ai.gate_aprobacion';

create or replace function public.licitacion_analisis_ia_pendientes(p_licitacion_id uuid)
returns table (
  id uuid,
  tipo_analisis text,
  documento_id uuid,
  created_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  with activos as (
    select distinct on (r.tipo_analisis, coalesce(r.documento_id, '00000000-0000-0000-0000-000000000000'::uuid))
           r.id, r.tipo_analisis, r.documento_id, r.created_at, r.estado_aprobacion
      from public.ai_results r
     where r.recurso_tipo = 'licitacion'
       and r.recurso_id = p_licitacion_id
     order by r.tipo_analisis,
              coalesce(r.documento_id, '00000000-0000-0000-0000-000000000000'::uuid),
              r.created_at desc
  )
  select id, tipo_analisis, documento_id, created_at
    from activos
   where estado_aprobacion = 'PENDIENTE'
   order by created_at desc;
$$;

comment on function public.licitacion_analisis_ia_pendientes(uuid) is
  'P2·B5 — versiones activas de ai_results de una licitación que siguen en PENDIENTE (bloquean el paso a ENVIADA cuando ai.gate_aprobacion está activo). SECURITY INVOKER: respeta la RLS de ai_results.';

grant execute on function public.licitacion_analisis_ia_pendientes(uuid) to authenticated, service_role;

insert into public.feature_flags (key, descripcion) values
  ('ai.gate_aprobacion', 'P2.3 D5 — bloquear el paso a ENVIADA si hay análisis de IA activos sin revisar')
on conflict (key) do nothing;
