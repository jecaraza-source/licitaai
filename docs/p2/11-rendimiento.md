# P2 · Entregable 9 — Rendimiento (Fase F)

P2.4: **"mide antes de optimizar"**. Esta fase instrumenta, pone
presupuestos verificables y aplica las optimizaciones seguras que no
necesitan un baseline para justificarse. Las optimizaciones dirigidas por
datos (índices por plan real, `ef_search` calibrado, quitar `select("*")`
concretos) se harán con `pg_stat_statements` y Speed Insights de
producción.

---

## 1. Instrumentación (F1)

| Señal | Cómo | Dónde se ve |
|---|---|---|
| Latencia de API por request | `apiRoute()` mide `performance.now()`, añade `Server-Timing: route;dur=<ms>` a la respuesta y loguea `[api:slow]` con `request_id` si > 800 ms | devtools (Network → Timing), logs de Vercel, `Server-Timing` en Speed Insights |
| Consultas lentas de Postgres | extensión `pg_stat_statements` (migración `20260831000000`) | Supabase Studio → Reports → Query Performance |
| Duración y arranque de jobs | `jobs.created_at / started_at / finished_at`; `metricas_operacion()` expone arranque p50/p95 y % sin intervención | `/admin/salud` |
| Core Web Vitals (LCP/INP/CLS) | `@vercel/speed-insights` (ya instalado) + `@vercel/analytics` | Vercel dashboard |
| Tamaño de bundle cliente | `scripts/check-bundle.mjs` sobre `.next/static/chunks` (gzip) | gate de CI (job `quality`) |
| Conexiones Realtime | una suscripción por vista, cleanup en unmount (revisado: `documentos-tab`, `analisis-ia-tab`, `use-job`) | Supabase Studio → Realtime |

## 2. Presupuestos de rendimiento (F2)

`perf-budgets.json` (gate de CI, `npm run check:bundle` tras `npm run build`):

| Presupuesto | Valor | Baseline F |
|---|---|---|
| Total JS cliente (gzip, todos los chunks) | ≤ 1500 KB | ~1258 KB |
| Chunk individual mayor (gzip) | ≤ 320 KB | ~250 KB |

Subir el presupuesto requiere justificarlo en el mismo PR.

Objetivos adicionales (verificables con datos de producción, aún **sin
gate**):

| Métrica | Objetivo | Estado |
|---|---|---|
| LCP / INP / CLS en las 3 rutas más usadas | < 2.5 s / < 200 ms / < 0.1 | pendiente de baseline |
| API p95 (rutas no-IA) | < 800 ms | instrumentado (`Server-Timing` + log `[api:slow]`) |
| Arranque de job p95 | < 10 s | medido en `/admin/salud` + alerta SEV2 |

## 3. Frontend (F3)

- **Code-split de las pestañas pesadas** de la licitación
  (`licitaciones/[id]/page.tsx`) vía `next/dynamic`: `DocumentosTab`,
  `PartidasTab`, `PropuestaTecnicaTab`, `PropuestaEconomicaTab`,
  `DocumentosLegalesTab`, `DocumentosTecnicosTab`. Radix `TabsContent` solo
  monta la pestaña activa → el chunk se descarga al cambiar de pestaña, no
  al abrir la licitación.
- **`react-pdf`** (`pdf-viewer.tsx`) → `next/dynamic` con `ssr: false`
  (usa `window`; ~pdf.js es de los chunks más grandes).
- **`exceljs`** (`partidas-tab`, `propuesta-economica-tab`) → `await
  import("exceljs")` dentro del handler de exportación, no en el módulo.
- **TipTap** (`propuesta-tecnica-tab`) → queda dentro del chunk
  code-split de esa pestaña.
- Paginación / virtualización de tablas grandes: `licitaciones` ya pagina
  server-side; virtualizar (`@tanstack/react-virtual`) es un fast-follow
  solo si el baseline muestra jank en listas largas.

## 4. Backend / Postgres (F4 — parcial)

Hecho ahora:
- Índices por los patrones de P2:
  `document_chunks (documento_id) where embedding is null` (step de
  embeddings de B1), `documentos (licitacion_id) where procesado = true`
  (conteo de chunks en `analizar-bases`).
- `statement_timeout` explícito en `search_chunks` (5 s),
  `metricas_operacion` (10 s), `presupuesto_ia_disponible` (5 s).
- `search_chunks`: `match_count` acotado a `[1, 50]`.

Pendiente de datos de producción:
- Revisar el top-10 de `pg_stat_statements` con `EXPLAIN ANALYZE`.
- Quitar `select("*")` en las rutas donde el plan lo justifique (las
  tablas con columnas grandes — `analisis_bases`, `propuestas.contenido_json`
  — son las candidatas; `document_chunks.*` ya no se selecciona en ninguna
  ruta, se usa el RPC `search_chunks`).
- Reducir N+1 (p. ej. `auditoria/auditar-todos` ya se reescribió a jobs).

## 5. pgvector (F5)

- `search_chunks` fija `hnsw.ef_search = 40` (el default de pgvector) de
  forma explícita, para poder calibrarlo con datos de **recall** reales:
  subirlo mejora recall a costa de latencia. No se cambia sin medir sobre
  el dataset de evals (D7).
- Retención de chunks/embeddings de licitaciones cerradas: Fase H
  (`data_retention_policy` + job de limpieza).

## 6. Qué falta para cerrar F

- 1–2 semanas de datos de producción para fijar los objetivos de CWV y de
  API p95 como gates.
- Lighthouse CI en los preview deployments (requiere G2 / staging).
- Revisión del top-10 de consultas con datos reales.

### Vigilancia de campo de Core Web Vitals (J-17)

**Estado (2026-11-09).** El código ya instrumenta: `<SpeedInsights />` y
`<Analytics />` están en `src/app/layout.tsx` y producción sirve sus
scripts desde el mismo origen (`/_vercel/…`), de modo que la CSP no necesita
cambios. Lo que **no** está comprobado es que Vercel los esté recibiendo:
la API respondió «Web Analytics not found» para el proyecto y Speed
Insights no se puede consultar por API. Hasta verlo en el panel, tómalo como
no confirmado.

**Para activarlo (dueño de la cuenta de Vercel):** proyecto `licitaai` →
pestaña *Speed Insights* → *Enable* (y *Analytics* → *Enable*).

**Rutina de revisión** (semanal durante el primer mes, luego mensual):

1. En *Speed Insights*, filtra por **Production** y mira el percentil **p75**
   por ruta, en móvil y escritorio por separado.
2. Compara con los objetivos de §2: LCP < 2.5 s, INP < 200 ms, CLS < 0.1.
   Las rutas que importan primero: `/licitaciones`, `/licitaciones/[id]`
   (pestañas pesadas, §3) y `/dashboard`.
3. Si una métrica de una de esas rutas pasa del umbral en p75: abrir un
   issue con la ruta, la métrica y el dispositivo; mirar primero el chunk de
   la pestaña (§3) y las consultas de esa ruta (§4).
4. Tras 1–2 semanas con datos, anotar aquí el baseline y convertir los
   objetivos de §2 en gate (cierra «pendiente de baseline»).

Limitaciones: con poco tráfico el p75 de una ruta tiene muy pocas muestras;
no actuar sobre rutas con decenas de visitas. Speed Insights no avisa
solo; la alerta es esta revisión manual.
