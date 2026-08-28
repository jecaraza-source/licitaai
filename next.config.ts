import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// Derivado de la variable de entorno en vez de estar fijo al proyecto de
// producción — de lo contrario, apuntar NEXT_PUBLIC_SUPABASE_URL a un
// stack local (supabase start, http://127.0.0.1:54321) queda bloqueado
// por esta misma CSP (connect-src) sin ningún error obvio del lado de la
// app: el navegador simplemente rechaza la petición.
const SUPABASE_URL = new URL(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://xvkgcxpzhkazhnqbtvou.supabase.co",
);
const SUPABASE_ORIGIN = SUPABASE_URL.origin;
const SUPABASE_WS_ORIGIN = `${SUPABASE_URL.protocol === "https:" ? "wss:" : "ws:"}//${SUPABASE_URL.host}`;

const ES_PROD = process.env.NODE_ENV === "production";

// P1.6 — `'unsafe-eval'` solo lo necesita el runtime de desarrollo (HMR de
// Turbopack, React Refresh). En producción se quita: los bundles de Next
// no evalúan strings. `'unsafe-inline'` para scripts sigue por el bootstrap
// inline de Next; migrar a nonces es el siguiente paso (requiere leer el
// nonce que Next inyecta desde un middleware).
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${ES_PROD ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${SUPABASE_ORIGIN}`,
  "font-src 'self' data:",
  `connect-src 'self' ${SUPABASE_ORIGIN} ${SUPABASE_WS_ORIGIN} https://*.ingest.sentry.io https://*.ingest.us.sentry.io`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  ...(ES_PROD ? ["upgrade-insecure-requests"] : []),
].join("; ");

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  images: {
    remotePatterns: [
      {
        protocol: SUPABASE_URL.protocol === "https:" ? "https" : "http",
        hostname: SUPABASE_URL.hostname,
        port: SUPABASE_URL.port || undefined,
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: CSP },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // P1.6 — HSTS: solo tiene efecto sobre HTTPS (el navegador lo
          // ignora en http://localhost), así que es seguro emitirlo
          // siempre. 2 años + preload, alineado con los requisitos de la
          // lista de preload de HSTS.
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: true,
  // Sin SENTRY_AUTH_TOKEN el plugin omite la subida de sourcemaps sin fallar
  // el build — queda inactivo hasta que se configuren las credenciales.
  authToken: process.env.SENTRY_AUTH_TOKEN,
  webpack: { treeshake: { removeDebugLogging: true } },
});
