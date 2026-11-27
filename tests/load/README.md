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

### Carga sostenida con IA real — `carga-ia-sostenida.mjs` (C6)

Encola decenas de `analizar-bases` repartidas en varias organizaciones y las
drena con varias invocaciones **concurrentes** del worker (`carga-ia-real.mjs`
las corre una por una y no puede ver esto). Mide: transiciones del circuit
breaker (CLOSED → OPEN → HALF_OPEN → CLOSED), jobs que reintentan y con qué
error, latencia de cola y duración por job con latencia real de proveedor,
throughput, reparto entre organizaciones y gasto.

```bash
# mismas keys y mismo arranque que en la sección anterior, luego:
CARGA_IA_ANALISIS=30 CARGA_IA_WORKERS=6 CARGA_IA_MAX_USD=2 \
  node tests/load/carga-ia-sostenida.mjs
```

Variables: `CARGA_IA_ANALISIS` (20), `CARGA_IA_ORGS` (3), `CARGA_IA_WORKERS` (6,
la concurrencia real contra el proveedor), `CARGA_IA_MAX_USD` (2),
`CARGA_IA_COSTO_EST` (0.05 por job, para el chequeo previo),
`CARGA_IA_TIMEOUT_MIN` (15), `CARGA_IA_DEBUG=1`.

Protecciones de gasto: no arranca si `jobs × coste estimado` supera
`CARGA_IA_MAX_USD`; si el gasto real lo supera durante la corrida, cancela lo
que queda en cola; aborta antes de gastar si detecta que el worker está en
modo mock (embeddings con el patrón `[1, 0, 0, …]`). Al terminar, o con
Ctrl+C / `kill`, restaura los flags (`ai.versionado_resultados`,
`resiliencia.circuit_breaker`, `ai.cache`), deja el breaker local en CLOSED y
borra sus datos. Un `kill -9` no puede limpiar: en ese caso, `npx supabase db
reset`.

**Qué no hace:** no puede provocar un 429. Si el proveedor no limita la tasa
con tu carga, el reporte lo dice ("no se observaron reintentos ni aperturas
del breaker"), y eso no demuestra que el breaker funcione bajo 429. Sube
workers y análisis con el tope a la vista para presionar más.

`CARGA_IA_SIMULADO=1` corre sin proveedores reales para validar el arnés. En
ese modo `analizar-bases` falla (no tiene mock) y el breaker de Anthropic abre
con los fallos consecutivos; sirve para comprobar la mecánica, no para medir.

#### Notas de entorno (CLI de Supabase ≥ 3)

- `config.toml`: la sección `[inbucket]` se renombró a `[local_smtp]` (la CLI
  nueva se niega a arrancar con el nombre viejo; la fijada en CI, 2.119.0, ya
  acepta el nuevo).
- El helper `tests/helpers/local-supabase.mjs` prefiere las keys nuevas
  (`sb_secret_…`), pero el runtime de Edge Functions de esa CLI compara el
  worker contra la key JWT clásica, y el worker responde «No autorizado» (los
  jobs se quedan en `AUTHORIZED`). Exporta las clásicas antes de correr:

```bash
eval "$(npx supabase status -o env | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=')"
export SUPABASE_URL="$API_URL" SUPABASE_ANON_KEY="$ANON_KEY" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
```
