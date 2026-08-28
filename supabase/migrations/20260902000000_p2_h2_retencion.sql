-- P2 · H2 — Política de retención de datos + limpieza programada (P2.6, ADR 0010).
--
-- `data_retention_policy` es la fuente de verdad: una fila por clase de dato,
-- con su ventana de retención y un interruptor `activo` + `dry_run`. La
-- función `ejecutar_limpieza_retencion()` recorre las políticas activas,
-- ARCHIVA a `retencion_archive` (jsonb frío, append-only) y luego borra.
--
-- Arranca TODO en dry_run: la función solo cuenta lo que borraría y lo
-- registra en `ultimo_resultado`. Pasar una política a real es un UPDATE
-- explícito (`dry_run = false`) revisado por un humano, nunca automático.
-- El cron (/api/cron/retencion) además está detrás del flag
-- `retencion.limpieza_automatica` (OFF).
--
-- Rollback:
--   drop function if exists public.ejecutar_limpieza_retencion(boolean);
--   drop table if exists public.retencion_archive;
--   drop table if exists public.data_retention_policy;

-- ============================================================================
-- Catálogo de políticas
-- ============================================================================
create table public.data_retention_policy (
  recurso            text primary key,
  clase              text not null check (clase in (
                       'log_operativo', 'operativo', 'fiscal',
                       'confidencial_derivado', 'legal', 'resultado_ia')),
  retencion_dias     integer not null check (retencion_dias > 0),
  descripcion        text not null,
  archiva            boolean not null default true,  -- copia a retencion_archive antes de borrar
  activo             boolean not null default false, -- si false: se ignora por completo
  dry_run            boolean not null default true,  -- si true: solo cuenta, no toca datos
  ultima_ejecucion_at timestamptz,
  ultimo_resultado   jsonb,
  updated_at         timestamptz not null default now()
);

comment on table public.data_retention_policy is
  'P2.6 — retención por clase de dato (ADR 0010). ejecutar_limpieza_retencion() la recorre. Cambiar activo/dry_run es un acto humano deliberado.';

alter table public.data_retention_policy enable row level security;
-- Sin políticas de RLS: solo service_role (bypass) la lee/escribe. Los
-- administradores de plataforma la consultan vía una ruta con service key.

insert into public.data_retention_policy (recurso, clase, retencion_dias, descripcion, archiva, activo, dry_run) values
  ('rate_limit_hits',       'log_operativo',         7,   'Contadores de rate-limit; solo importan dentro de la ventana móvil.', false, false, true),
  ('ai_usage_log',          'fiscal',                395, 'Uso de IA por organización. 13 meses para conciliación fiscal; luego a archivo frío.', true, false, true),
  ('ai_budget_ledger',      'fiscal',                395, 'Libro mayor de presupuesto de IA (RESERVADO/CONSUMIDO/LIBERADO). 13 meses; luego a archivo.', true, false, true),
  ('jobs_terminados',       'operativo',             90,  'Jobs en estado terminal (COMPLETED/FAILED/CANCELLED/EXPIRED). El resultado ya vive en la tabla de dominio.', true, false, true),
  ('jobs_dead_letter',      'operativo',             180, 'Dead-letter queue. Se conserva hasta resolución o 180 días.', true, false, true),
  ('actividad_log',         'operativo',             730, 'Historial de actividad por licitación (visible en la app). 24 meses.', true, false, true),
  ('document_chunks_cerradas','confidencial_derivado',365,'Embeddings de licitaciones CERRADAS. Se borra el vector; el documento y su texto quedan.', false, false, true);

-- ============================================================================
-- Archivo frío (append-only, inmutable como audit_log)
-- ============================================================================
create table public.retencion_archive (
  id            bigint generated always as identity primary key,
  recurso       text not null,
  fila_id       text,                 -- pk original como texto (trazabilidad)
  fila          jsonb not null,       -- la fila completa tal cual
  organization_id uuid,               -- si se puede derivar, para restore selectivo
  archivado_at  timestamptz not null default now()
);
create index retencion_archive_recurso_idx on public.retencion_archive (recurso, archivado_at);
create index retencion_archive_org_idx on public.retencion_archive (organization_id) where organization_id is not null;

comment on table public.retencion_archive is
  'Archivo frío append-only de filas purgadas por retención. Fuente para restore selectivo (04-rollback-y-dr.md). Inmutable.';

alter table public.retencion_archive enable row level security;

create or replace function public._retencion_archive_inmutable()
returns trigger language plpgsql as $$
begin
  raise exception 'retencion_archive es append-only (intento de % en id %)', tg_op, coalesce(old.id, -1);
end;
$$;

create trigger retencion_archive_no_update before update on public.retencion_archive
  for each row execute function public._retencion_archive_inmutable();
create trigger retencion_archive_no_delete before delete on public.retencion_archive
  for each row execute function public._retencion_archive_inmutable();

-- ============================================================================
-- Limpieza
-- ============================================================================
-- p_forzar_dry_run:
--   null  -> respeta el dry_run de cada política (default)
--   true  -> fuerza dry-run en todas (para el cron en modo observación)
--   false -> NO fuerza real; una política sigue en dry-run si su fila lo dice
--
-- Devuelve un reporte jsonb. Nunca lanza: un error por recurso se captura y
-- se reporta en su entrada.
create or replace function public.ejecutar_limpieza_retencion(p_forzar_dry_run boolean default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pol       public.data_retention_policy;
  v_corte     timestamptz;
  v_dry       boolean;
  v_cand      bigint;
  v_arch      bigint;
  v_borr      bigint;
  v_entrada   jsonb;
  v_reporte   jsonb := '[]'::jsonb;
  v_err       text;
begin
  for v_pol in select * from public.data_retention_policy where activo = true order by recurso loop
    v_corte := now() - make_interval(days => v_pol.retencion_dias);
    v_dry   := coalesce(p_forzar_dry_run, false) or v_pol.dry_run;
    v_cand  := 0; v_arch := 0; v_borr := 0; v_err := null;

    begin
      case v_pol.recurso

        when 'rate_limit_hits' then
          select count(*) into v_cand from public.rate_limit_hits where created_at < v_corte;
          if not v_dry then
            delete from public.rate_limit_hits where created_at < v_corte;
            get diagnostics v_borr = row_count;
          end if;

        when 'ai_usage_log' then
          select count(*) into v_cand from public.ai_usage_log where created_at < v_corte;
          if not v_dry then
            with movidas as (
              delete from public.ai_usage_log where created_at < v_corte returning *
            ), archivadas as (
              insert into public.retencion_archive (recurso, fila_id, fila, organization_id)
              select 'ai_usage_log', m.id::text, to_jsonb(m), m.organization_id from movidas m
              returning 1
            )
            select count(*) into v_borr from movidas;
            v_arch := v_borr;
          end if;

        when 'ai_budget_ledger' then
          select count(*) into v_cand from public.ai_budget_ledger where created_at < v_corte;
          if not v_dry then
            with movidas as (
              delete from public.ai_budget_ledger where created_at < v_corte returning *
            ), archivadas as (
              insert into public.retencion_archive (recurso, fila_id, fila, organization_id)
              select 'ai_budget_ledger', m.id::text, to_jsonb(m), m.organization_id from movidas m
              returning 1
            )
            select count(*) into v_borr from movidas;
            v_arch := v_borr;
          end if;

        when 'jobs_terminados' then
          select count(*) into v_cand from public.jobs
          where estado in ('COMPLETED','FAILED','CANCELLED','EXPIRED')
            and coalesce(finished_at, updated_at) < v_corte;
          if not v_dry then
            with movidos as (
              delete from public.jobs
              where estado in ('COMPLETED','FAILED','CANCELLED','EXPIRED')
                and coalesce(finished_at, updated_at) < v_corte
              returning *
            ), archivados as (
              insert into public.retencion_archive (recurso, fila_id, fila, organization_id)
              select 'jobs', m.id::text, to_jsonb(m), m.organization_id from movidos m
              returning 1
            )
            select count(*) into v_borr from movidos;
            v_arch := v_borr;
          end if;

        when 'jobs_dead_letter' then
          select count(*) into v_cand from public.jobs_dead_letter where created_at < v_corte;
          if not v_dry then
            with movidos as (
              delete from public.jobs_dead_letter where created_at < v_corte returning *
            ), archivados as (
              insert into public.retencion_archive (recurso, fila_id, fila, organization_id)
              select 'jobs_dead_letter', m.id::text, to_jsonb(m), m.organization_id from movidos m
              returning 1
            )
            select count(*) into v_borr from movidos;
            v_arch := v_borr;
          end if;

        when 'actividad_log' then
          select count(*) into v_cand from public.actividad_log where created_at < v_corte;
          if not v_dry then
            with movidas as (
              delete from public.actividad_log a where a.created_at < v_corte returning a.*
            ), archivadas as (
              insert into public.retencion_archive (recurso, fila_id, fila, organization_id)
              select 'actividad_log', m.id::text, to_jsonb(m),
                     (select l.organization_id from public.licitaciones l where l.id = m.licitacion_id)
              from movidas m
              returning 1
            )
            select count(*) into v_borr from movidas;
            v_arch := v_borr;
          end if;

        when 'document_chunks_cerradas' then
          select count(*) into v_cand
          from public.document_chunks c
          join public.documentos d on d.id = c.documento_id
          join public.licitaciones l on l.id = d.licitacion_id
          where l.estado_licitacion = 'CERRADA'
            and coalesce(l.fecha_fallo, l.created_at) < v_corte
            and c.embedding is not null;
          if not v_dry then
            update public.document_chunks c
            set embedding = null
            from public.documentos d
            join public.licitaciones l on l.id = d.licitacion_id
            where c.documento_id = d.id
              and l.estado_licitacion = 'CERRADA'
              and coalesce(l.fecha_fallo, l.created_at) < v_corte
              and c.embedding is not null;
            get diagnostics v_borr = row_count;
          end if;

        else
          v_err := 'recurso sin implementación en ejecutar_limpieza_retencion';
      end case;

    exception when others then
      v_err := left(sqlerrm, 300);
    end;

    v_entrada := jsonb_build_object(
      'recurso', v_pol.recurso,
      'clase', v_pol.clase,
      'retencion_dias', v_pol.retencion_dias,
      'corte', v_corte,
      'dry_run', v_dry,
      'candidatas', v_cand,
      'archivadas', v_arch,
      'borradas', v_borr,
      'error', v_err
    );
    v_reporte := v_reporte || v_entrada;

    update public.data_retention_policy
    set ultima_ejecucion_at = now(), ultimo_resultado = v_entrada, updated_at = now()
    where recurso = v_pol.recurso;
  end loop;

  return jsonb_build_object(
    'generado_at', now(),
    'forzar_dry_run', p_forzar_dry_run,
    'recursos', v_reporte
  );
end;
$$;

revoke all on function public.ejecutar_limpieza_retencion(boolean) from public, anon, authenticated;
grant execute on function public.ejecutar_limpieza_retencion(boolean) to service_role;

comment on function public.ejecutar_limpieza_retencion(boolean) is
  'P2.6 — recorre data_retention_policy activas, archiva a retencion_archive y borra. Respeta dry_run por política. Solo service_role.';
