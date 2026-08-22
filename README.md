# LicitaAI

Plataforma SaaS que automatiza con IA el proceso de participación en licitaciones
públicas mexicanas: análisis de bases, estudio de mercado, generación de propuestas
técnica/económica, auditoría documental y seguimiento post-entrega. Soporta
Federal (CompraNet), Estado de México (EDCA) y CDMX (SCA).

## Stack

Next.js 16 (App Router) · TypeScript strict · Tailwind v4 + shadcn/ui (Base UI) ·
Supabase (Postgres + pgvector + Auth + Storage + Realtime + Edge Functions) ·
Claude Sonnet 5 + OpenAI embeddings · TanStack Table · react-hook-form + zod ·
TipTap · react-pdf · react-dropzone · docx / xlsx · Resend · Sentry · Playwright.

## Setup local

1. **Instalar dependencias**
   ```bash
   npm install
   ```
2. **Variables de entorno** — copia `.env.example` a `.env.local` y llena los
   valores (ver la sección siguiente).
3. **Vincular el proyecto de Supabase** (si no está vinculado)
   ```bash
   npx supabase link --project-ref <project-ref>
   ```
4. **Aplicar migraciones** — las migraciones viven en `supabase/migrations/` y
   ya están aplicadas en el proyecto remoto de desarrollo. Para un proyecto
   nuevo:
   ```bash
   npx supabase db push
   ```
5. **Levantar el servidor de desarrollo**
   ```bash
   npm run dev
   ```
   Abre [http://localhost:3000](http://localhost:3000).

## Variables de entorno

| Variable | Requerida para | Dónde obtenerla |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Todo | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Todo | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Cron de alertas de vencimiento | Supabase → Project Settings → API |
| `ANTHROPIC_API_KEY` | Análisis IA, chat, propuestas, auditoría | console.anthropic.com |
| `OPENAI_API_KEY` | Embeddings (búsqueda semántica) | platform.openai.com |
| `RESEND_API_KEY` | Emails transaccionales | resend.com/api-keys |
| `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_DSN` | Monitoreo de errores (opcional) | sentry.io |
| `SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN` | Subida de sourcemaps (opcional) | sentry.io |
| `CRON_SECRET` | Autoriza el cron de Vercel | Genera cualquier cadena aleatoria |
| `NEXT_PUBLIC_APP_URL` | Links en emails | URL pública del deploy |

Las variables de IA/Edge Functions también deben configurarse como *secrets*
de Supabase Edge Functions (no solo en `.env.local`):

```bash
npx supabase secrets set ANTHROPIC_API_KEY=... OPENAI_API_KEY=...
```

## Migraciones

Cada cambio de esquema vive como un archivo SQL en `supabase/migrations/`,
nombrado `YYYYMMDDHHMMSS_descripcion.sql`. Para aplicar una migración nueva:

```bash
npx supabase migration up
# o, contra el proyecto remoto directamente:
npx supabase db push
```

## Edge Functions

Las funciones de IA pesada corren como Supabase Edge Functions (Deno), no
como API routes de Next.js, para evitar los límites de tiempo de las
funciones serverless de Vercel:

| Función | Qué hace |
|---|---|
| `procesar-documento` | Extrae texto (con fallback OCR vía Claude), genera chunks + embeddings |
| `analizar-bases` | Análisis de bases por secciones con Claude, genera checklist y partidas |
| `generar-estudio-mercado` | Investiga precios de mercado por partida (Claude + búsqueda web) |
| `generar-preguntas-junta` | Genera preguntas para la junta de aclaraciones |
| `generar-propuesta-tecnica` | Redacta la propuesta técnica por secciones |
| `auditar-documento` | Audita un documento contra un requisito del checklist |
| `auditar-expediente` | Revisión cruzada de consistencia de todo el expediente |

Desplegar una función:

```bash
npx supabase functions deploy <nombre-de-la-funcion>
```

**Nota de diseño:** las llamadas a Claude con `web_search` o generación larga
usan streaming (`messages.stream().finalMessage()`) — sin esto, el gateway de
Edge Functions de Supabase cierra la conexión a los 150s de inactividad.

## Pruebas E2E

```bash
npx playwright test
```

La mayoría de las pruebas requieren una cuenta ya confirmada, porque el
proyecto de Supabase exige confirmación de correo por defecto y un registro
real no se puede automatizar en CI sin leer el correo de confirmación:

```bash
TEST_USER_EMAIL=... TEST_USER_PASSWORD=... npx playwright test
```

Para las pruebas de `multi-rol.spec.ts` también se necesita una segunda
cuenta con `rol = 'VIEWER'` en la misma organización
(`TEST_VIEWER_EMAIL` / `TEST_VIEWER_PASSWORD`).

## Deploy

El proyecto está vinculado a Vercel. Push a `main` dispara el deploy vía
`.github/workflows/deploy.yml` (lint + build + deploy). El cron de alertas de
vencimiento (`vercel.json`) corre diario a las 13:00 UTC.

Secrets de GitHub Actions requeridos: `VERCEL_TOKEN`, `VERCEL_ORG_ID`,
`VERCEL_PROJECT_ID`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

## Arquitectura (resumen)

- **Multi-tenant** vía Row Level Security: cada tabla filtra por
  `organization_id` (directo o a través de `licitacion_id`), con helpers
  `user_org_id()` / `is_write_role()` en Postgres.
- **Roles**: `ADMIN`, `MANAGER`, `ANALYST` pueden escribir; `VIEWER` es
  solo lectura (aplicado en RLS y, para las rutas de escritura más visibles,
  también en la UI).
- **Rate limiting**: `check_rate_limit()` (Postgres, ventana deslizante) —
  10 solicitudes/minuto por usuario en endpoints de IA.
- **Storage**: 4 buckets (`documentos-originales`, `propuestas-generadas`,
  `documentos-requeridos` privados; `logos-empresa` público), con políticas
  que exigen que el primer segmento de la ruta sea el `organization_id`.
- **CSP y encabezados de seguridad**: configurados en `next.config.ts`
  (framework-nativo, sin duplicar en `vercel.json`).

## Limitaciones conocidas

- El e.firma SAT implementado firma con RSA-SHA256 como mecanismo de
  integridad **interno** de LicitaAI — no es una firma PAdES ni un sello
  reconocido oficialmente por el SAT para trámites.
- El email de bienvenida solo se envía automáticamente cuando la
  confirmación de correo está deshabilitada en el proyecto de Supabase (si
  está habilitada, no hay sesión inmediata tras el registro para dispararlo).
- `xlsx` (SheetJS) tiene una vulnerabilidad conocida sin parche en el
  registro de npm; considerar migrar a `exceljs` o al tarball oficial de
  SheetJS si esto es una preocupación para producción.
