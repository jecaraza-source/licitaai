import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const SUPABASE_ORIGIN = "https://xvkgcxpzhkazhnqbtvou.supabase.co";
const SUPABASE_WS_ORIGIN = "wss://xvkgcxpzhkazhnqbtvou.supabase.co";

const CSP = [
  "default-src 'self'",
  // 'unsafe-inline'/'unsafe-eval' son necesarios por cómo Next.js hidrata y
  // hace HMR; una CSP basada en nonces es un endurecimiento posible a futuro.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${SUPABASE_ORIGIN}`,
  "font-src 'self' data:",
  `connect-src 'self' ${SUPABASE_ORIGIN} ${SUPABASE_WS_ORIGIN} https://*.ingest.sentry.io https://*.ingest.us.sentry.io`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "xvkgcxpzhkazhnqbtvou.supabase.co",
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
