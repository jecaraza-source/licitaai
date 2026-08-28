import * as Sentry from "@sentry/nextjs";
import { sentryBeforeSend, SENTRY_ENV } from "@/lib/observabilidad";

// P1.7 — config común: sin PII de defecto, con scrubber de datos de
// request/extra/user y tag de entorno. `beforeSend` redacta cualquier
// campo con nombre sensible antes de que el evento salga.
const comun = {
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
  environment: SENTRY_ENV,
  beforeSend: (evento: Parameters<NonNullable<Sentry.NodeOptions["beforeSend"]>>[0]) =>
    sentryBeforeSend(evento as unknown as Record<string, unknown>) as unknown as typeof evento,
};

export async function register() {
  if (!process.env.SENTRY_DSN) return;

  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({ dsn: process.env.SENTRY_DSN, ...comun });
  }
}

export const onRequestError = Sentry.captureRequestError;
