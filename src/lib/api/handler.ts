import { NextResponse, type NextRequest } from "next/server";
import type { z } from "zod";
import { ApiError } from "./errors";
import { apiOk, apiErrorResponse } from "./response";
import { logApiError } from "./log";
import { requireApiContext, requireRole, type ApiContext, type Rol } from "./context";
import { validarParams, validarQuery, validarBody } from "./validate";
import { checkRateLimit } from "@/lib/rate-limit";
import { checkAiBudget } from "@/lib/ai-usage";

type RouteParams = Record<string, string | string[]>;
type NextRouteContext = { params: Promise<RouteParams> };

interface ApiRouteConfig<
  TParams extends z.ZodTypeAny | undefined,
  TQuery extends z.ZodTypeAny | undefined,
  TBody extends z.ZodTypeAny | undefined,
> {
  /** Schema para los route params (p. ej. `{id: z.string().uuid()}`). Si se
   * omite, `params` llega como `undefined` al handler. */
  paramsSchema?: TParams;
  /** Schema para los query params (`?page=1&...`). */
  querySchema?: TQuery;
  /** Schema para el body JSON. No usar en GET/DELETE. */
  bodySchema?: TBody;
  /** Roles permitidos — por defecto cualquier rol autenticado. Usa
   * requireWriteRole()/["ADMIN","MANAGER","ANALYST"] para excluir VIEWER. */
  rolesPermitidos?: readonly Rol[];
  /** Si se define, aplica check_rate_limit (mismo mecanismo que las Edge
   * Functions) antes de ejecutar el handler. */
  rateLimit?: { ruta: string; max?: number };
  /** Si es true, aplica el tope diario de tokens de IA por organización
   * (check_ai_budget) antes de ejecutar el handler — usar en toda ruta que
   * llame a un modelo de IA directa o indirectamente (vía Edge Function). */
  aiBudget?: boolean;
}

type Infer<T extends z.ZodTypeAny | undefined> = T extends z.ZodTypeAny ? z.output<T> : undefined;

interface HandlerArgs<
  TParams extends z.ZodTypeAny | undefined,
  TQuery extends z.ZodTypeAny | undefined,
  TBody extends z.ZodTypeAny | undefined,
> {
  ctx: ApiContext;
  params: Infer<TParams>;
  query: Infer<TQuery>;
  body: Infer<TBody>;
  request: NextRequest;
}

type HandlerResult<T> = { data: T; status?: number } | Response;

/**
 * Envuelve un handler de ruta API con la capa común (P1.1): autenticación,
 * autorización por rol, rate limiting, presupuesto de IA, validación Zod de
 * params/query/body, sobre de respuesta uniforme, manejo de excepciones y
 * un request_id de correlación en cada respuesta y cada línea de log.
 *
 * El handler NUNCA debe dejar escapar un error de Postgres/Supabase/un SDK
 * de IA directo al cliente — cualquier `throw` que no sea una ApiError se
 * convierte aquí en un 500 genérico (INTERNAL_ERROR) sin el mensaje
 * interno, que sí se registra server-side junto al request_id.
 */
export function apiRoute<
  TParams extends z.ZodTypeAny | undefined = undefined,
  TQuery extends z.ZodTypeAny | undefined = undefined,
  TBody extends z.ZodTypeAny | undefined = undefined,
  TResult = unknown,
>(
  config: ApiRouteConfig<TParams, TQuery, TBody>,
  handler: (args: HandlerArgs<TParams, TQuery, TBody>) => Promise<HandlerResult<TResult>>,
) {
  return async function routeHandler(
    request: NextRequest,
    routeCtx?: NextRouteContext,
  ): Promise<NextResponse> {
    const requestId = crypto.randomUUID();
    const path = request.nextUrl.pathname;
    const method = request.method;
    let ctx: ApiContext | undefined;

    try {
      ctx = await requireApiContext(requestId);

      if (config.rolesPermitidos) {
        requireRole(ctx, config.rolesPermitidos);
      }

      if (config.rateLimit) {
        const dentroDelLimite = await checkRateLimit(
          ctx.supabase,
          config.rateLimit.ruta,
          config.rateLimit.max,
        );
        if (!dentroDelLimite) throw ApiError.rateLimited();
      }

      if (config.aiBudget) {
        const dentroDelPresupuesto = await checkAiBudget(ctx.supabase);
        if (!dentroDelPresupuesto) throw ApiError.aiBudgetExceeded();
      }

      const rawParams = routeCtx?.params ? await routeCtx.params : {};
      const params = (
        config.paramsSchema ? validarParams(config.paramsSchema, rawParams) : undefined
      ) as Infer<TParams>;
      const query = (
        config.querySchema ? validarQuery(config.querySchema, request.nextUrl.searchParams) : undefined
      ) as Infer<TQuery>;
      const body = (
        config.bodySchema ? await validarBody(config.bodySchema, request) : undefined
      ) as Infer<TBody>;

      const resultado = await handler({ ctx, params, query, body, request });

      if (resultado instanceof Response) return resultado as NextResponse;
      return apiOk(resultado.data, requestId, { status: resultado.status });
    } catch (error) {
      const apiError = error instanceof ApiError ? error : ApiError.internal();
      logApiError(
        { requestId, method, path, organizationId: ctx?.organizationId, userId: ctx?.userId },
        error,
      );
      return apiErrorResponse(apiError, requestId);
    }
  };
}
