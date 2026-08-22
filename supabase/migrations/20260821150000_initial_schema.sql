-- LicitaAI — Sprint 1: esquema inicial
-- Plataforma de gestión de licitaciones públicas mexicanas (CompraNet / EDCA / SCA)

create extension if not exists "pgcrypto" with schema extensions;
create extension if not exists "vector";

-- ============================================================================
-- ORGANIZATIONS
-- ============================================================================
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  rfc text,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- USERS (perfil 1:1 con auth.users)
-- ============================================================================
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null,
  nombre text not null,
  rol text not null default 'ANALYST' check (rol in ('ADMIN', 'MANAGER', 'ANALYST', 'VIEWER')),
  created_at timestamptz not null default now()
);

create index users_organization_id_idx on public.users (organization_id);

-- ============================================================================
-- LICITACIONES
-- ============================================================================
create table public.licitaciones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  numero_expediente text not null,
  titulo text not null,
  institucion text not null,
  estado_licitacion text not null default 'NUEVA'
    check (estado_licitacion in ('NUEVA', 'ANALISIS', 'PREPARACION', 'ENVIADA', 'SEGUIMIENTO', 'CERRADA')),
  tipo text not null check (tipo in ('ADQUISICION', 'SERVICIOS', 'OBRA_PUBLICA')),
  monto_maximo numeric(14, 2),
  fecha_publicacion timestamptz,
  fecha_junta_aclaraciones timestamptz,
  fecha_visita timestamptz,
  fecha_entrega_propuesta timestamptz,
  fecha_apertura_tecnica timestamptz,
  fecha_apertura_economica timestamptz,
  fecha_fallo timestamptz,
  estado_id text not null check (estado_id in ('FEDERAL', 'EDOMEX', 'CDMX')),
  sistema text not null check (sistema in ('COMPRANET', 'EDCA', 'SCA')),
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index licitaciones_organization_id_idx on public.licitaciones (organization_id);
create index licitaciones_estado_licitacion_idx on public.licitaciones (estado_licitacion);
create index licitaciones_fecha_entrega_propuesta_idx on public.licitaciones (fecha_entrega_propuesta);

-- ============================================================================
-- DOCUMENTOS
-- ============================================================================
create table public.documentos (
  id uuid primary key default gen_random_uuid(),
  licitacion_id uuid not null references public.licitaciones (id) on delete cascade,
  tipo_documento text not null,
  nombre text not null,
  storage_path text not null,
  tamanio_bytes bigint,
  procesado boolean not null default false,
  procesado_at timestamptz,
  created_at timestamptz not null default now()
);

create index documentos_licitacion_id_idx on public.documentos (licitacion_id);

-- ============================================================================
-- PARTIDAS
-- ============================================================================
create table public.partidas (
  id uuid primary key default gen_random_uuid(),
  licitacion_id uuid not null references public.licitaciones (id) on delete cascade,
  numero text not null,
  descripcion text not null,
  unidad text,
  cantidad numeric(14, 3),
  precio_unitario_referencia numeric(14, 2)
);

create index partidas_licitacion_id_idx on public.partidas (licitacion_id);

-- ============================================================================
-- PROPUESTAS
-- ============================================================================
create table public.propuestas (
  id uuid primary key default gen_random_uuid(),
  licitacion_id uuid not null references public.licitaciones (id) on delete cascade,
  tipo text not null check (tipo in ('TECNICA', 'ECONOMICA')),
  version integer not null default 1,
  estado text not null default 'BORRADOR'
    check (estado in ('BORRADOR', 'EN_REVISION', 'APROBADA', 'ENVIADA')),
  contenido_json jsonb not null default '{}'::jsonb,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index propuestas_licitacion_id_idx on public.propuestas (licitacion_id);

-- ============================================================================
-- CHECKLIST ITEMS
-- ============================================================================
create table public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  licitacion_id uuid not null references public.licitaciones (id) on delete cascade,
  categoria text not null check (categoria in ('LEGAL', 'FISCAL', 'TECNICO', 'ECONOMICO', 'ESPECIFICO')),
  descripcion text not null,
  fundamento_legal text,
  vigencia_requerida text,
  formato_aceptado text,
  requerido boolean not null default true,
  estado text not null default 'PENDIENTE' check (estado in ('PENDIENTE', 'COMPLETO', 'NO_APLICA')),
  documento_id uuid references public.documentos (id) on delete set null
);

create index checklist_items_licitacion_id_idx on public.checklist_items (licitacion_id);

-- ============================================================================
-- ANALISIS DE BASES (salida IA)
-- ============================================================================
create table public.analisis_bases (
  id uuid primary key default gen_random_uuid(),
  licitacion_id uuid not null references public.licitaciones (id) on delete cascade,
  objeto_contrato text,
  tipo_procedimiento text,
  monto_maximo_estimado numeric(14, 2),
  moneda text default 'MXN',
  fechas_json jsonb default '{}'::jsonb,
  requisitos_legales_json jsonb default '[]'::jsonb,
  documentacion_requerida_json jsonb default '[]'::jsonb,
  criterios_evaluacion_json jsonb default '[]'::jsonb,
  garantias_json jsonb default '[]'::jsonb,
  forma_presentacion text,
  notas_json jsonb default '[]'::jsonb,
  nivel_confianza text check (nivel_confianza in ('ALTO', 'MEDIO', 'BAJO')),
  created_at timestamptz not null default now()
);

create index analisis_bases_licitacion_id_idx on public.analisis_bases (licitacion_id);

-- ============================================================================
-- PROPUESTA ECONOMICA — PARTIDAS
-- ============================================================================
create table public.propuesta_economica_partidas (
  id uuid primary key default gen_random_uuid(),
  licitacion_id uuid not null references public.licitaciones (id) on delete cascade,
  partida_id uuid references public.partidas (id) on delete set null,
  descripcion text not null,
  cantidad numeric(14, 3),
  unidad text,
  precio_unitario_ofertado numeric(14, 2),
  subtotal numeric(14, 2),
  iva numeric(14, 2),
  total numeric(14, 2),
  margen_porcentaje numeric(6, 2),
  precio_referencia_mercado numeric(14, 2)
);

create index propuesta_economica_partidas_licitacion_id_idx on public.propuesta_economica_partidas (licitacion_id);

-- ============================================================================
-- PROPUESTA ECONOMICA — CONFIG (una por licitación)
-- ============================================================================
create table public.propuesta_economica_config (
  id uuid primary key default gen_random_uuid(),
  licitacion_id uuid not null unique references public.licitaciones (id) on delete cascade,
  tipo_precio text,
  incluye_iva boolean not null default true,
  moneda text not null default 'MXN',
  condiciones_pago text,
  tiempo_entrega_dias integer,
  validez_oferta_dias integer
);

-- ============================================================================
-- ESTUDIO DE MERCADO
-- ============================================================================
create table public.estudio_mercado (
  id uuid primary key default gen_random_uuid(),
  licitacion_id uuid not null references public.licitaciones (id) on delete cascade,
  partida_id uuid references public.partidas (id) on delete cascade,
  precio_minimo numeric(14, 2),
  precio_maximo numeric(14, 2),
  precio_promedio numeric(14, 2),
  precio_recomendado numeric(14, 2),
  fuentes_json jsonb default '[]'::jsonb,
  observaciones text,
  nivel_confianza text check (nivel_confianza in ('ALTO', 'MEDIO', 'BAJO')),
  created_at timestamptz not null default now()
);

create index estudio_mercado_licitacion_id_idx on public.estudio_mercado (licitacion_id);
create index estudio_mercado_partida_id_idx on public.estudio_mercado (partida_id);

-- ============================================================================
-- JUNTA DE ACLARACIONES (una por licitación)
-- ============================================================================
create table public.junta_aclaraciones (
  id uuid primary key default gen_random_uuid(),
  licitacion_id uuid not null unique references public.licitaciones (id) on delete cascade,
  preguntas_json jsonb not null default '[]'::jsonb,
  respuestas_json jsonb not null default '[]'::jsonb,
  estado text not null default 'BORRADOR' check (estado in ('BORRADOR', 'ENVIADA', 'RESPONDIDA')),
  created_at timestamptz not null default now()
);

-- ============================================================================
-- ACTIVIDAD LOG
-- ============================================================================
create table public.actividad_log (
  id uuid primary key default gen_random_uuid(),
  licitacion_id uuid not null references public.licitaciones (id) on delete cascade,
  user_id uuid references public.users (id) on delete set null,
  accion text not null,
  metadata_json jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index actividad_log_licitacion_id_idx on public.actividad_log (licitacion_id);
create index actividad_log_created_at_idx on public.actividad_log (created_at desc);

-- ============================================================================
-- ESTADOS CONFIG (catálogo global, no multi-tenant)
-- ============================================================================
create table public.estados_config (
  id uuid primary key default gen_random_uuid(),
  estado_id text not null unique check (estado_id in ('FEDERAL', 'EDOMEX', 'CDMX')),
  nombre_portal text not null,
  url_portal text,
  sistema_publicacion text not null,
  requisitos_extra_json jsonb default '[]'::jsonb,
  instrucciones_carga text
);

-- ============================================================================
-- EMPRESA PERFIL (una por organización)
-- ============================================================================
create table public.empresa_perfil (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations (id) on delete cascade,
  razon_social text,
  rfc text,
  giro text,
  experiencia_anos integer,
  certificaciones_json jsonb default '[]'::jsonb,
  clientes_referencia_json jsonb default '[]'::jsonb,
  logo_url text,
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- DOCUMENT CHUNKS (RAG — pgvector)
-- ============================================================================
create table public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  documento_id uuid not null references public.documentos (id) on delete cascade,
  chunk_index integer not null,
  contenido text not null,
  embedding vector(1536),
  metadata_json jsonb default '{}'::jsonb
);

create index document_chunks_documento_id_idx on public.document_chunks (documento_id);
create index document_chunks_embedding_idx on public.document_chunks
  using hnsw (embedding vector_cosine_ops);

-- ============================================================================
-- updated_at trigger para empresa_perfil
-- ============================================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger empresa_perfil_set_updated_at
  before update on public.empresa_perfil
  for each row
  execute function public.set_updated_at();

-- ============================================================================
-- Trigger: crear perfil public.users al registrarse en auth.users
-- Espera raw_user_meta_data: { nombre, organization_id }
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, organization_id, email, nombre, rol)
  values (
    new.id,
    (new.raw_user_meta_data ->> 'organization_id')::uuid,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'nombre', new.email),
    coalesce(new.raw_user_meta_data ->> 'rol', 'ADMIN')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
