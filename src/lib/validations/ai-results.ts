import { z } from "zod";

// P2 · D — esquemas de la API de resultados de IA (ADR 0006).

export const TIPOS_ANALISIS = [
  "analisis_bases",
  "estudio_mercado",
  "junta_respuestas",
  "analisis_fallo",
  "auditoria_documento",
  "auditoria_expediente",
  "propuesta_tecnica",
  "documento_corporativo",
] as const;

export const listarAiResultsQuerySchema = z.object({
  tipo_analisis: z.enum(TIPOS_ANALISIS).optional(),
  documento_id: z.string().uuid().optional(),
});

export const revisionAiResultSchema = z.object({
  estado: z.enum(["APROBADO", "RECHAZADO", "PENDIENTE"]),
  /** Motivo del rechazo — para el flujo "reportar resultado incorrecto" (D6). */
  motivo: z.string().trim().max(2000).optional(),
});

export const aiResultIdParamsSchema = z.object({
  id: z.string().uuid("id debe ser un UUID válido"),
});

export const AI_RESULT_COLUMNS =
  "id, recurso_tipo, recurso_id, documento_id, tipo_analisis, prompt_template_id, " +
  "prompt_version, provider, modelo, tokens_input, tokens_output, costo_usd, latencia_ms, " +
  "resultado_json, nivel_confianza, salida_incompleta, estado_aprobacion, aprobado_por, " +
  "aprobado_at, reemplaza_a, reused_from, origen, created_at";
