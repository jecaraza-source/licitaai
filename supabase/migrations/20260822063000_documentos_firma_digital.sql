-- LicitaAI — Sprint 6: metadatos de firma digital (e.firma SAT) por documento
-- Nota: solo se guarda la firma resultante y metadatos del certificado
-- público; la llave privada y contraseña nunca se persisten.

alter table public.documentos add column firma_digital_json jsonb;
