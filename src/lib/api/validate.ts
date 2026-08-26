import type { z } from "zod";
import { ApiError } from "./errors";

const MAX_BODY_BYTES = 5 * 1024 * 1024; // 5MB — generoso para JSON de formularios; los uploads van por Storage, no por este body

function errorDeZod(zodError: z.ZodError): ApiError {
  const flat = zodError.flatten();
  return ApiError.validation("Datos de entrada inválidos", flat);
}

/** Valida route params (p. ej. `{ id: "..." }` de un segmento dinámico)
 * contra un schema Zod. Los params de Next.js siempre llegan como
 * string — el schema decide si además deben ser un UUID, un enum, etc. */
export function validarParams<T extends z.ZodTypeAny>(schema: T, params: unknown): z.output<T> {
  const parsed = schema.safeParse(params);
  if (!parsed.success) throw errorDeZod(parsed.error);
  return parsed.data;
}

/** Convierte URLSearchParams a un objeto plano (última ocurrencia de cada
 * clave gana, salvo que el propio schema use `z.array` sobre `getAll`) y
 * lo valida contra un schema Zod. */
export function validarQuery<T extends z.ZodTypeAny>(schema: T, searchParams: URLSearchParams): z.output<T> {
  const objeto: Record<string, string> = {};
  for (const [clave, valor] of searchParams.entries()) {
    objeto[clave] = valor;
  }
  const parsed = schema.safeParse(objeto);
  if (!parsed.success) throw errorDeZod(parsed.error);
  return parsed.data;
}

/**
 * Lee y valida el body JSON de la request. Rechaza con VALIDATION_ERROR si
 * el JSON es inválido/está vacío (en vez de dejar que `request.json()`
 * lance una excepción no controlada que degradaría a 500), y con
 * PAYLOAD_TOO_LARGE si el Content-Length declarado excede el máximo — antes
 * de siquiera intentar parsear.
 */
export async function validarBody<T extends z.ZodTypeAny>(schema: T, request: Request): Promise<z.output<T>> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_BODY_BYTES) {
    throw ApiError.payloadTooLarge();
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    throw ApiError.validation("El cuerpo de la solicitud debe ser JSON válido");
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) throw errorDeZod(parsed.error);
  return parsed.data;
}
