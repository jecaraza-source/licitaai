# Pruebas de carga — P2 · Fase J

Sin infraestructura permanente. Dos herramientas:

## 1. `carga-local.mjs` — carga directa a Postgres (sin k6, corre ya)

Ejercita cola → worker → RLS con carga concurrente multi-organización.
Verifica lo que importa bajo carga: cero doble-procesamiento
(`FOR UPDATE SKIP LOCKED`), aislamiento entre organizaciones, idempotencia,
cancelación cooperativa, y que la cola queda vacía.

```bash
npx supabase start
CARGA_ORGS=20 CARGA_JOBS_POR_ORG=25 CARGA_WORKERS=4 node tests/load/carga-local.mjs
# o: npm run test:load
```

Variables: `CARGA_ORGS` (10), `CARGA_JOBS_POR_ORG` (20), `CARGA_WORKERS`
(3, invocaciones concurrentes del worker), `CARGA_REQ_EN_VUELO` (4,
peticiones en vuelo por organización — el Postgres local no tiene pooler).

Usa el tipo de job `noop` (determinista, sin IA) → reproducible en CI y sin
API keys.

## 2. `api-jobs.k6.js` — carga HTTP del stack completo (requiere k6)

Ejercita Next.js → `apiRoute` (auth + RLS + rate limit + flags) → `crear_job`,
midiendo latencia y errores como los ve un cliente real.

```bash
# instalar k6: https://k6.io/docs/get-started/installation/
npx supabase start
FLAG_JOBS_API=on npm run dev          # la app, con el flag encendido

node tests/load/gen-tokens.mjs 20 > /tmp/tokens.json
k6 run -e BASE_URL=http://localhost:3000 -e TOKENS_JSON=/tmp/tokens.json \
  tests/load/api-jobs.k6.js
```

Umbrales: `http_req_duration p95 < 800 ms` · `p99 < 2000 ms` ·
`errores_negocio < 1%` · `checks > 99%`.

## 3. Carga con IA real (requiere API keys + presupuesto autorizado)

Para medir el worker con `procesar-documento` / `analizar-bases` reales:

1. `supabase secrets set ANTHROPIC_API_KEY=... OPENAI_API_KEY=...` (o en el
   `.env` del edge runtime local).
2. Subir `CARGA_JOBS_POR_ORG` con moderación (cada job cuesta dinero real).
3. Cambiar `p_tipo` en `carga-local.mjs` a `procesar-documento` con un
   `documento_id` real, o usar el flujo e2e.

**No se ejecuta en CI ni por defecto**: gasto real + los límites de
`ai_org_policy` (cuota mensual, por operación) están para impedirlo.
Ver `docs/p2/15-pruebas-aceptacion.md` §carga con IA.
