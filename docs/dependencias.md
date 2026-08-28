# Dependencias y versiones (P1.8)

## Runtimes

| Runtime | Dónde | Versión objetivo | Notas |
|---|---|---|---|
| Node.js | app Next.js (Vercel), scripts, tests | 24 (CI) / ≥20 (local) | `@types/node` fijado a `^20` para no adelantarse a lo que Vercel garantiza |
| Deno | Edge Functions (`supabase/functions`) | v2.x (CI `setup-deno`) | runtime aislado; sus dependencias se declaran con especificadores `npm:` / `jsr:` en cada import, no en `package.json` |
| Next.js | — | `16.3.2` (fijo, sin `^`) | mayores ignorados en Dependabot — ver `AGENTS.md`; upgrades manuales con los codemods |
| Supabase JS | `@supabase/supabase-js ^2.112`, `@supabase/ssr ^0.12` | — | los tipos se regeneran del esquema real (`npm run typegen`, P1.4) |

## Skew Node ↔ Deno (documentado, no se fuerza)

Las Edge Functions pinnean sus propias versiones porque corren en Deno, no comparten `node_modules` con la app:

| Paquete | `package.json` (Node) | Edge Functions (Deno) | Acción |
|---|---|---|---|
| `@anthropic-ai/sdk` | `^0.120` | `0.68` (varias funciones) | Alinear al subir el SDK de Deno; hoy el gap `web_search_20260209` está documentado en `docs/security-p0-hardening.md` §7 |
| `openai` | `^7.5` | `npm:openai@^6` | idem — el uso es solo `embeddings.create`, estable entre v6 y v7 |
| `@langchain/textsplitters` | *(retirado)* | `npm:@langchain/textsplitters@^0.1` | **la app Next no usa langchain** — se retiró de `package.json` (ver abajo); las Edge Functions lo traen por su cuenta |

Forzar una sola versión rompería uno de los dos lados; el criterio es alinearlas en la próxima actualización deliberada de cada SDK, no automáticamente.

## Paquetes retirados en P1.8

`npx depcheck` + revisión manual:

| Paquete | Motivo |
|---|---|
| `@langchain/core`, `@langchain/textsplitters`, `langchain` | no se importan en `src/` — solo las Edge Functions usan text-splitters, y lo hacen con su propio pin `npm:@langchain/textsplitters@^0.1`. Eran ~peso muerto en install/bundle |
| `shadcn` movido a `devDependencies` | es un CLI (`npx shadcn add …`), nunca se importa en runtime |

Falsos positivos de depcheck que **se conservan**: `tw-animate-css` (import en `globals.css`), `@tailwindcss/postcss` y `tailwindcss` (build de PostCSS).

## SBOM y licencias

- `npm run sbom` → `sbom.cyclonedx.json` (CycloneDX 1.5, solo producción). CI lo sube como artefacto (retención 90 días).
- `npm run licenses` (`scripts/check-licenses.mjs`) — falla si una dependencia de producción tiene licencia fuera de la allowlist permisiva (MIT/ISC/BSD/Apache-2.0/…) o sin licencia declarada. En CI, en el job `quality`.

Excepciones revisadas y aceptadas (en `scripts/check-licenses.mjs`):

| Paquete | Licencia | Por qué se acepta |
|---|---|---|
| `@img/sharp-libvips-*`, `@img/sharp-*` | LGPL-3.0-or-later | libvips es una librería nativa enlazada dinámicamente; LGPL no obliga a nada en un SaaS que no distribuye el binario. El artefacto darwin-arm64 es solo de desarrollo |
| `@sentry/cli*` | FSL-1.1-MIT | herramienta de build (sourcemaps); source-available, se convierte en MIT a los 2 años, uso interno permitido |
| `buffers`, `chainsaw`, `traverse@0.3` | sin campo SPDX | paquetes de substack (~2012), MIT de facto (README), transitivos sin reemplazo directo |

## Actualizaciones automáticas

`.github/dependabot.yml`:
- **npm** (`/`), semanal — agrupa parches/minors; mayores individuales; `next` mayor ignorado.
- **github-actions** (`/`), mensual.
- **docker** (`/supabase`), mensual.

`npm audit --omit=dev --audit-level=high` en CI (job `quality`) — hoy **0 vulnerabilidades**.
