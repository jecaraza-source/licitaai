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

## 3. Validación con IA real — `carga-ia-real.mjs`

Corrida **acotada** (no carga masiva) contra Anthropic + OpenAI de verdad:
confirma el camino no-MOCK (extracción, embeddings reales de 1536 dim,
`ai_results`, `ai_usage_log`) y mide latencia + coste real por job.

```bash
# 1. keys en el edge runtime local (gitignored)
cat > supabase/functions/.env <<'EOF'
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
JOB_MOCK_AI=0
EOF
npx supabase stop && npx supabase start --exclude vector,imgproxy

# 2. correr (GASTA DINERO REAL — por defecto ~3 docs + 2 análisis, <$0.10)
CARGA_IA_DOCS=2 CARGA_IA_ANALISIS=2 node tests/load/carga-ia-real.mjs
```

Cuando termines, `JOB_MOCK_AI=1` (o borra el `.env`) para que las suites
normales no gasten. Resultados de referencia en
`docs/p2/15-pruebas-aceptacion.md` §4.

**No se ejecuta en CI**: gasto real + `ai_org_policy` (cuota mensual, por
operación) está para impedir una corrida grande sin querer.

### Carga sostenida con IA real (pendiente de presupuesto)

Para el comportamiento del breaker bajo throttling real (429 de Anthropic)
y la cola bajo latencia de proveedor de 20–30 s/job: subir
`CARGA_IA_ANALISIS` a decenas y correr con `CARGA_WORKERS` alto. Cada
`analizar-bases` cuesta ~$0.03.
