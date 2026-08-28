import * as Sentry from "@sentry/nextjs";
import { sentryBeforeSend, SENTRY_ENV } from "@/lib/observabilidad";

// Sin NEXT_PUBLIC_SENTRY_DSN configurado, Sentry.init con dsn undefined no
// envía nada — queda inactivo hasta que se configure la variable de entorno.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
  environment: SENTRY_ENV,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  beforeSend: (evento) =>
    sentryBeforeSend(evento as unknown as Record<string, unknown>) as unknown as typeof evento,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
