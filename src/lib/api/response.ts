import { NextResponse } from "next/server";
import type { ApiError } from "./errors";

// P1.1 — sobre de respuesta uniforme para toda ruta bajo src/app/api.
// Antes de esta capa cada ruta devolvía una forma distinta (`{error}`,
// `{error: {...}}`, a veces ni siquiera un objeto) — esto estandariza el
// contrato para que el frontend pueda manejar cualquier respuesta con un
// solo tipo.
export interface ApiSuccessBody<T> {
  data: T;
  error: null;
  meta: { request_id: string };
}

export interface ApiErrorBody {
  data: null;
  error: { code: string; message: string; details?: unknown };
  meta: { request_id: string };
}

export function apiOk<T>(
  data: T,
  requestId: string,
  init?: { status?: number },
): NextResponse<ApiSuccessBody<T>> {
  return NextResponse.json(
    { data, error: null, meta: { request_id: requestId } },
    { status: init?.status ?? 200 },
  );
}

export function apiErrorResponse(error: ApiError, requestId: string): NextResponse<ApiErrorBody> {
  return NextResponse.json(
    {
      data: null,
      error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) },
      meta: { request_id: requestId },
    },
    { status: error.status },
  );
}
