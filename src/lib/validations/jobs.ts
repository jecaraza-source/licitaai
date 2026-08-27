import { z } from "zod";

// P2 · A4 — esquemas de la API de jobs asíncronos.

/** Tipos de operación que pueden encolarse. "noop" es solo para pruebas de
 * infraestructura (Fase A); el resto los habilita su flag `jobs.async_*`
 * cuando su handler de dominio existe (Fase B). */
export const JOB_TIPOS = [
  "noop",
  "procesar-documento",
  "analizar-bases",
  "generar-estudio-mercado",
  "generar-preguntas-junta",
  "generar-propuesta-tecnica",
  "auditar-documento",
  "auditar-expediente",
  "seguimiento-analizar-fallo",
  "analizar-documento-corporativo",
  "procesar-referencia-legal",
  "exportar-organizacion",
] as const;
export type JobTipo = (typeof JOB_TIPOS)[number];

export const JOB_RECURSO_TIPOS = [
  "licitacion",
  "documento",
  "documento_corporativo",
  "checklist_item",
  "referencia_legal",
  "organizacion",
] as const;

export const JOB_ESTADOS = [
  "PENDING",
  "AUTHORIZED",
  "RUNNING",
  "RETRYING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "EXPIRED",
] as const;

export const crearJobSchema = z.object({
  tipo: z.enum(JOB_TIPOS),
  recurso_tipo: z.enum(JOB_RECURSO_TIPOS).optional(),
  recurso_id: z.string().uuid().optional(),
  input: z.record(z.string(), z.unknown()).optional().default({}),
  idempotency_key: z.string().trim().min(1).max(200).optional(),
  prioridad: z.number().int().min(1).max(1000).optional(),
  dedup_hash: z.string().trim().min(1).max(128).optional(),
})
  // recurso_tipo y recurso_id van juntos o ninguno.
  .refine((v) => (v.recurso_tipo == null) === (v.recurso_id == null), {
    message: "recurso_tipo y recurso_id deben especificarse juntos",
    path: ["recurso_id"],
  });

export const listarJobsQuerySchema = z.object({
  estado: z.enum(JOB_ESTADOS).optional(),
  tipo: z.enum(JOB_TIPOS).optional(),
  recurso_tipo: z.enum(JOB_RECURSO_TIPOS).optional(),
  recurso_id: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const jobIdParamsSchema = z.object({
  id: z.string().uuid("id debe ser un UUID válido"),
});

/** Columnas de `jobs` seguras de devolver al cliente. Se omiten
 * `input_json` (puede llevar datos sensibles), `error_interno_ref`,
 * `worker_id` y `reserva_id`. */
export const JOB_COLUMNS_PUBLICAS =
  "id, tipo, recurso_tipo, recurso_id, estado, prioridad, progreso, progreso_detalle, " +
  "step_actual, intentos, max_intentos, provider, modelo, tokens_input, tokens_output, " +
  "costo_real_usd, result_ref, error_seguro, reused_from, created_at, authorized_at, " +
  "started_at, finished_at, expires_at";
