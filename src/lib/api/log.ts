import { ApiError } from "./errors";

// P1.1 — registro seguro de errores para rutas API. Nunca debe imprimir
// contraseñas, llaves privadas, JWTs, el service role, documentos
// completos, o el mensaje crudo de Postgres/un SDK de IA hacia stdout de
// forma que asocie ese detalle con datos de negocio identificables más de
// lo necesario para depurar. Este módulo es deliberadamente pequeño: la
// observabilidad estructurada completa (Sentry, tokens/costo, etc.) es
// P1.7, no P1.1 — esto solo asegura que CADA ruta ya loguea con
// request_id desde ahora, en vez de un `console.error(error)` suelto.
export interface LogContext {
  requestId: string;
  method: string;
  path: string;
  organizationId?: string;
  userId?: string;
}

const CAMPOS_SENSIBLES = /password|contrasena|contraseña|secret|token|api[_-]?key|private[_-]?key|service[_-]?role|authorization/i;

function redactar(valor: unknown): unknown {
  if (valor === null || valor === undefined) return valor;
  if (typeof valor !== "object") return valor;
  if (Array.isArray(valor)) return valor.map(redactar);
  const salida: Record<string, unknown> = {};
  for (const [clave, val] of Object.entries(valor as Record<string, unknown>)) {
    salida[clave] = CAMPOS_SENSIBLES.test(clave) ? "[redactado]" : redactar(val);
  }
  return salida;
}

/**
 * Registra un error de ruta API de forma segura: el código y el mensaje
 * SEGURO de la ApiError (o un mensaje genérico si fue un error no
 * controlado), nunca el stack trace completo de un error de Postgres/SDK
 * de IA hacia ningún canal visible al cliente — eso solo se registra
 * server-side, aquí, para depuración.
 */
export function logApiError(ctx: LogContext, error: unknown): void {
  const esApiError = error instanceof ApiError;
  const registro = {
    request_id: ctx.requestId,
    method: ctx.method,
    path: ctx.path,
    organization_id: ctx.organizationId,
    user_id: ctx.userId,
    error_code: esApiError ? error.code : "INTERNAL_ERROR",
    error_message: esApiError ? error.message : error instanceof Error ? error.message : String(error),
    details: esApiError ? redactar(error.details) : undefined,
  };
  console.error("[api]", JSON.stringify(registro));
}
