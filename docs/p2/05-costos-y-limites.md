# P2 · Entregable 18 — Estimación mensual de infraestructura y límites operativos

Cifras en USD/mes, orden de magnitud, para dimensionar — no cotización. Supuestos de volumen: **50–200 organizaciones**, ~15 licitaciones/org/mes, ~12 operaciones de IA/licitación (ver `01-arquitectura-actual.md` §7). A confirmar con datos reales de P2.4-F1.

---

## 1. Infraestructura de plataforma

| Servicio | Hoy | Con P2 | Δ | Nota |
|---|---|---|---|---|
| Vercel (Pro, por asiento) | ~$20/asiento | ~$20/asiento | — | Fluid/`maxDuration` incluido en Pro. Cron incluido. |
| Vercel — funciones/ancho de banda | bajo | **bajo–medio** | + $0–50 | El async **reduce** tiempo-función (respuestas cortas); el worker corre en Supabase, no en Vercel. |
| Supabase **producción** (Pro) | $25 + compute | $25 + compute | — | Necesario para PITR y límites de Edge Functions. |
| Supabase compute (prod) | Small/Medium | **Medium/Large** | + $0–110 | +carga: worker cada 10 s, `pg_cron`, `ai_budget_ledger`, `ai_results`, evals. Empezar en el actual y subir con métricas. |
| Supabase **PITR add-on** (prod) | — | **+ $100** (7 días) | + $100 | ADR 0010. **Requiere aprobación.** Alternativa interina: `pg_dump` diario (~$0, usa Storage). |
| Supabase **staging** (Pro) | — | **+ $25** (+ compute Small) | + $25–35 | ADR 0009. Puede pausarse fuera de horario. |
| Supabase **test / CI** | — | $0–25 | + $0–25 | Reusar staging con `db reset`, o proyecto Free efímero. |
| Supabase Storage (respaldo) | incluido | + $0.021/GB | + $5–30 | Copia de documentos + `pg_dump`. |
| Sentry | plan actual | igual | — | P2 usa tags de org, no más volumen material. |
| Resend | plan actual | + marginal | + $0–10 | +correos de "job completado". |
| **Subtotal plataforma** | | | **+ $160–370/mes** | de los cuales ~$125–160 son staging + PITR (aprobación) |

## 2. Consumo de IA (Anthropic + OpenAI)

Es el costo dominante y **variable con el uso**. P2 no lo crea — lo hace **medible y controlable**.

| Concepto | Estimación | Nota |
|---|---|---|
| Coste por expedient completo (12 ops × ~24k tokens, mix económico/avanzado) | **~$0.30–1.50/expediente** | métrica de valor I7 lo mide real |
| Volumen: 200 orgs × 15 licitaciones | 3 000 expedientes/mes | |
| **Gasto IA bruto estimado** | **$900–4 500/mes** | sin optimización |
| Ahorro por `ai_cache` + dedup de embeddings (C5) | **−15 % a −40 %** | re-análisis, docs repetidos entre licitaciones |
| Ahorro por política "modelo económico por defecto" (C4) | **−20 % a −50 %** | extracción/clasificación no necesitan el modelo avanzado |
| Ahorro por límite de reintentos facturables (E1) | −2 % a −10 % | |
| Coste de las evals (D7) | **+ $20–80/mes** | 30 casos × corrida semanal + PRs de IA |
| **Gasto IA neto con P2** | **~$500–2 500/mes** | y con techo duro por org vía `ai_org_policy` |

**Control:** `ai_org_policy` fija `cuota_mensual_usd` por org (p. ej. plan Base $15, Pro $60, Enterprise custom). El gasto de la plataforma nunca excede `Σ cuotas` + margen de conciliación.

## 3. Límites operativos (valores iniciales, ajustables con métricas)

| Límite | Valor inicial | Dónde se aplica | Por qué |
|---|---|---|---|
| Jobs concurrentes por org | 3 (Base) / 8 (Pro) | `crear_job` vs `ai_org_policy.max_concurrent_jobs` | Evita que 1 org acapare el worker |
| Jobs concurrentes globales (worker) | 5 por invocación × N invocaciones | `job-worker` `LIMIT` | Cabe en wall-clock; sube con compute |
| Presupuesto de tiempo por step | 90 s | handlers de step | Margen bajo el wall-clock de Edge Functions |
| Timeout de llamada a proveedor | 120 s | `AbortController` | p99 de respuestas largas |
| `lease_expires_at` (job) | 5 min | worker | Detectar worker muerto |
| `expires_at` (job sin tomar) | 1 h (interactivo) / 24 h (batch) | `crear_job` | Limpieza de jobs zombi |
| Reintentos por job | 3 | `max_intentos` | |
| Reintentos facturables por job | 2 | `ai_org_policy` | Tope de costo por fallo |
| Cuota mensual IA por org | $15 / $60 / custom | `ai_org_policy` | Plan comercial |
| Límite diario IA por org | cuota_mensual / 10 | `ai_org_policy` | Suaviza picos |
| Límite por operación | $2 | `ai_org_policy` | Un job no se come el presupuesto |
| Tamaño máx de documento | 50 MB | Storage + validación | Ya existe |
| Retención `document_chunks` (licitación CERRADA) | 12 meses | job de limpieza | Costo de almacenamiento vector |
| Retención `jobs` terminados | 90 días → archive | job de limpieza | Tamaño de tabla / Realtime |
| `AI_DAILY_TOKEN_CAP` global | 3M (se mantiene) | `check_ai_budget` | Red de seguridad final |
| Rate limit por minuto | sin cambio (P0.6) | `check_rate_limit` | Primera línea |
| Capacidad soportada estimada con esta config | ~200 orgs / ~4 000 jobs-día en compute Medium | — | Se re-mide en Fase J |

## 4. Costo de ingeniería (esfuerzo, no USD)

Suma de `03-plan-incremental.md`: Fase A ~2 sem · Fase B ~3–4 sem · C ~2 sem · D ~3 sem (evals dominan) · E ~1.5 sem · F ~2–3 sem · G ~1.5 sem · H ~2–3 sem · I ~2–3 sem · J ~1 sem. **Total orientativo: 4–6 meses de 1 ingeniero**, paralelizable en varios frentes tras la Fase A.

## 5. Recomendación de gasto

1. **Aprobar ya:** proyecto Supabase de staging (+$25–35/mes) — bloquea el criterio de terminación.
2. **Aprobar pronto:** PITR de prod (+$100/mes) o aceptar formalmente `pg_dump` diario con RPO de 24 h como interino.
3. **Diferir:** subir compute — hacerlo reactivo a las métricas de Fase F, no preventivo.
4. El gasto de IA se vuelve **predecible y acotado** al terminar la Fase C; hasta entonces, vigilar `ai_usage_log` semanalmente.
