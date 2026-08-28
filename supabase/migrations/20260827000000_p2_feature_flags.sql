-- P2 · G1 — Feature flags (ADR 0008).
--
-- Flags server-side respaldados por esta tabla + override por variable de
-- entorno (FLAG_<KEY>), evaluados en src/lib/flags.ts (Node) y
-- supabase/functions/_shared/flags.ts (Deno). Sin proveedor externo.
--
-- Resolución (ver evaluarFlag() en ambos módulos):
--   1. env FLAG_<KEY>=on|off  gana sobre todo (kill switch sin tocar DB)
--   2. orgs_excluidas  -> false
--   3. orgs_incluidas  -> true
--   4. rollout_pct     -> hash(key + org) % 100 < rollout_pct  (determinista)
--   5. default         -> enabled
--
-- Rollback: drop table public.feature_flags cascade;

create table if not exists public.feature_flags (
  key text primary key,
  descripcion text not null default '',
  enabled boolean not null default false,
  rollout_pct smallint not null default 0 check (rollout_pct between 0 and 100),
  orgs_incluidas uuid[] not null default '{}',
  orgs_excluidas uuid[] not null default '{}',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users (id) on delete set null
);

comment on table public.feature_flags is
  'Feature flags de plataforma (P2, ADR 0008). Evaluados server-side. Un cambio aquí afecta a todas las organizaciones segun rollout_pct/orgs_incluidas/orgs_excluidas — los cambios de alto impacto pasan por audit_log / PR a seed.';

alter table public.feature_flags enable row level security;

-- Lectura para cualquier usuario autenticado (la evaluación necesita la
-- fila; no hay nada sensible en ella). Sin políticas de escritura: los
-- flags se cambian por migración/seed o por el service role desde un panel
-- de administración (P2.10), nunca por un cliente regular.
drop policy if exists feature_flags_select_authenticated on public.feature_flags;
create policy feature_flags_select_authenticated
  on public.feature_flags
  for select
  to authenticated
  using (true);

create trigger feature_flags_set_updated_at
  before update on public.feature_flags
  for each row
  execute function public.set_updated_at();

-- ============================================================================
-- Seed de los flags de la fase P2 — todos apagados (enabled=false,
-- rollout_pct=0). Se activan por incremento, tras sus tests, y solo con
-- autorización. `on conflict do nothing` para que re-aplicar la migración
-- no pise un rollout ya en curso.
-- ============================================================================
insert into public.feature_flags (key, descripcion) values
  ('jobs.async_procesar_documento',    'P2.1 B1 — procesar-documento vía sistema de jobs asíncrono'),
  ('jobs.async_analizar_bases',        'P2.1 B2 — analizar-bases vía jobs'),
  ('jobs.async_estudio_mercado',       'P2.1 B3 — generar-estudio-mercado vía jobs'),
  ('jobs.async_preguntas_junta',       'P2.1 B4 — generar-preguntas-junta vía jobs'),
  ('jobs.async_propuesta_tecnica',     'P2.1 B5 — generar-propuesta-tecnica vía jobs'),
  ('jobs.async_auditar_documento',     'P2.1 B6 — auditar-documento vía jobs'),
  ('jobs.async_auditar_expediente',    'P2.1 B7 — auditar-expediente + fan-out como N jobs'),
  ('jobs.async_analizar_fallo',        'P2.1 B8 — seguimiento/analizar-fallo vía jobs'),
  ('jobs.async_analizar_doc_corp',     'P2.1 B9 — analizar-documento-corporativo vía jobs'),
  ('jobs.async_procesar_referencia',   'P2.1 B10 — procesar-referencia-legal vía jobs'),
  ('ai.gobierno_costo',                'P2.2 — reserva y conciliación de costo de IA por organización'),
  ('ai.cache',                         'P2.2 C5 — cache de resultados de IA por hash de contenido'),
  ('ai.versionado_resultados',         'P2.3 — ai_results append-only como registro canónico'),
  ('resiliencia.circuit_breaker',      'P2.5 — circuit breakers por proveedor externo'),
  ('perf.virtualizar_tablas',          'P2.4 — virtualización de tablas grandes en el frontend'),
  ('retencion.limpieza_automatica',    'P2.6 — jobs de limpieza de datos por política de retención')
on conflict (key) do nothing;
