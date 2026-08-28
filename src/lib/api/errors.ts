// P1.1 — catálogo de errores de la capa común de rutas API.
//
// El code es estable y pensado para que el frontend pueda tomar decisiones
// (p. ej. mostrar un formulario de upgrade en AI_BUDGET_EXCEEDED) sin tener
// que parsear el mensaje. El message SIEMPRE debe ser seguro para mostrar
// al usuario final — nunca el mensaje crudo de Postgres/Supabase/un SDK de
// IA (eso puede filtrar nombres de tabla, columnas, o detalles internos).
export type ApiErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "UNPROCESSABLE_CONTENT"
  | "PAYLOAD_TOO_LARGE"
  | "RATE_LIMITED"
  | "AI_BUDGET_EXCEEDED"
  | "UPSTREAM_ERROR"
  | "INTERNAL_ERROR";

const STATUS_POR_CODE: Record<ApiErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  CONFLICT: 409,
  UNPROCESSABLE_CONTENT: 422,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  AI_BUDGET_EXCEEDED: 429,
  UPSTREAM_ERROR: 502,
  INTERNAL_ERROR: 500,
};

/**
 * Todo error que un handler quiera convertir en una respuesta HTTP
 * controlada debe lanzar (throw) una ApiError — el wrapper apiRoute() la
 * captura y la serializa en el sobre uniforme. Cualquier otro throw
 * (un Error de Postgres, una excepción del SDK de Anthropic, un bug) se
 * trata como INTERNAL_ERROR y su mensaje real NUNCA se envía al cliente,
 * solo se registra server-side junto al request_id.
 */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  /** Detalle adicional seguro de exponer (p. ej. errores de campo de Zod).
   * Nunca poner aquí un error.message crudo de Postgres/Supabase/IA. */
  readonly details?: unknown;

  constructor(code: ApiErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = STATUS_POR_CODE[code];
    this.details = details;
  }

  static unauthenticated(message = "No autenticado"): ApiError {
    return new ApiError("UNAUTHENTICATED", message);
  }

  static forbidden(message = "No tienes permiso para realizar esta acción"): ApiError {
    return new ApiError("FORBIDDEN", message);
  }

  static notFound(message = "Recurso no encontrado"): ApiError {
    return new ApiError("NOT_FOUND", message);
  }

  static validation(message: string, details?: unknown): ApiError {
    return new ApiError("VALIDATION_ERROR", message, details);
  }

  static conflict(message: string, details?: unknown): ApiError {
    return new ApiError("CONFLICT", message, details);
  }

  static unprocessableContent(message: string): ApiError {
    return new ApiError("UNPROCESSABLE_CONTENT", message);
  }

  static payloadTooLarge(message = "La solicitud excede el tamaño máximo permitido"): ApiError {
    return new ApiError("PAYLOAD_TOO_LARGE", message);
  }

  static rateLimited(message = "Demasiadas solicitudes. Intenta de nuevo en un minuto."): ApiError {
    return new ApiError("RATE_LIMITED", message);
  }

  static aiBudgetExceeded(
    message = "Se alcanzó el límite diario de uso de IA para tu organización. Intenta de nuevo mañana.",
  ): ApiError {
    return new ApiError("AI_BUDGET_EXCEEDED", message);
  }

  static upstream(message = "Un proveedor externo no pudo procesar la solicitud"): ApiError {
    return new ApiError("UPSTREAM_ERROR", message);
  }

  static internal(message = "Error interno"): ApiError {
    return new ApiError("INTERNAL_ERROR", message);
  }
}
