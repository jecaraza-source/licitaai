// P1.7 — observabilidad: una línea de log estructurada por request y por
// evento de IA, con redacción consistente, y un scrubber para Sentry.
//
// Nunca debe salir a ningún canal: contraseñas, llaves privadas, JWT, el
// service role, documentos completos, prompts con contenido sensible, RFC
// completo, ni correos completos cuando no hacen falta.

const CAMPOS_SENSIBLES =
  /pass(word)?|contrase|secret|token|api[_-]?key|private[_-]?key|service[_-]?role|authorization|cookie|\bjwt\b|\bcer\b|\bkey_base64\b|firma_base64/i;

/** Un id de usuario nunca se loguea entero: solo un prefijo estable, útil
 * para correlacionar varias líneas del mismo usuario sin identificarlo. */
export function anonimizarUserId(userId?: string | null): string | undefined {
  if (!userId) return undefined;
  return `u_${userId.slice(0, 8)}`;
}

/** De un correo solo se conserva el dominio (para agrupar por cliente sin
 * guardar la dirección). */
export function dominioDeEmail(email?: string | null): string | undefined {
  if (!email || !email.includes("@")) return undefined;
  return email.split("@")[1]?.toLowerCase();
}

/** Redacta recursivamente cualquier clave con nombre sensible. */
export function redactar(valor: unknown): unknown {
  if (valor === null || valor === undefined || typeof valor !== "object") return valor;
  if (Array.isArray(valor)) return valor.map(redactar);
  const salida: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
    salida[k] = CAMPOS_SENSIBLES.test(k) ? "[redactado]" : redactar(v);
  }
  return salida;
}

export interface EventoRequest {
  request_id: string;
  method: string;
  path: string;
  status: number;
  duracion_ms: number;
  organization_id?: string;
  user?: string;
  error_code?: string;
  /** Uso de IA asociado a esta request, si lo hubo. */
  ia?: {
    proveedor?: string;
    modelo?: string;
    tokens_input?: number;
    tokens_output?: number;
    costo_estimado_usd?: number;
    reintentos?: number;
  };
}

/**
 * Emite una línea JSON estructurada por request. Un solo formato para
 * éxito y error — antes solo se logueaba en error o cuando era lenta.
 */
export function logRequest(evento: EventoRequest): void {
  const nivel = evento.status >= 500 ? "error" : evento.status >= 400 ? "warn" : "info";
  const linea = JSON.stringify({ nivel, ...evento });
  if (nivel === "error") console.error("[req]", linea);
  else if (nivel === "warn") console.warn("[req]", linea);
  else console.log("[req]", linea);
}

/**
 * `beforeSend` para Sentry: quita PII de defecto, redacta datos de la
 * request y añade el tag de organización de forma segura (solo el id, que
 * no es PII). El `request_id` viaja como tag para correlacionar con los
 * logs de `logRequest`.
 */
export function sentryBeforeSend(evento: Record<string, unknown>): Record<string, unknown> {
  const e = evento;

  if (e.request && typeof e.request === "object") {
    const req = e.request as Record<string, unknown>;
    delete req.cookies;
    delete req.headers;
    if (req.data) req.data = redactar(req.data);
    if (typeof req.query_string === "string" && req.query_string.length > 500) {
      req.query_string = req.query_string.slice(0, 500);
    }
  }

  if (e.extra) e.extra = redactar(e.extra);
  if (e.contexts) e.contexts = redactar(e.contexts);

  // El usuario: solo un prefijo anonimizado, nunca email/ip.
  if (e.user && typeof e.user === "object") {
    const u = e.user as Record<string, unknown>;
    e.user = { id: anonimizarUserId(typeof u.id === "string" ? u.id : undefined) };
  }

  return evento;
}

export const SENTRY_ENV =
  process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development";
