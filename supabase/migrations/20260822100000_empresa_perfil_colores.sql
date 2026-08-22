-- LicitaAI: colores de marca por empresa, extraídos del logo al subirlo.
-- Se usan para retemizar la UI del panel cuando esa empresa está activa.

alter table public.empresa_perfil
  add column color_primario text,
  add column color_secundario text;
