-- LicitaAI — Sprint 7: evita reenviar la alerta de vencimiento cada día

alter table public.licitaciones add column alerta_vencimiento_enviada_at timestamptz;
