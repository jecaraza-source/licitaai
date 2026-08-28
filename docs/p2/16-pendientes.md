# P2 · Pendientes — lista para atender uno por uno

Estado al cierre de las fases A–J. Ordenado por: primero lo que desbloquea
el despliegue, luego los huecos de código dentro del alcance de P2, luego
lo que necesita producción, luego lo post-despliegue, y al final los
follow-ups que son su propia fase.

Leyenda de esfuerzo: **S** ≤ 1 día · **M** 2–4 días · **L** ~1 semana · **XL** > 1 semana.

---

## A. Habilitar el despliegue — decisiones, no código

| # | Pendiente | Bloquea | Quién | Esfuerzo | Estado |
|---|---|---|---|---|---|
| A1 | **Proyecto Supabase de staging** + secrets/vars en GitHub + Vercel + branch protection + Environment `production` con reviewers | todo despliegue; los workflows ya referencian estos nombres | Dueño de la cuenta Supabase/Vercel | M | 🟢 **hecho**: proyecto `licitaai-staging` (`vuoimnwhxzlfelacvinf`, us-east-1, $10/mes) + 59 migraciones + 12 functions + 6 secrets. GitHub: `SUPABASE_ACCESS_TOKEN`, env `staging` con `STAGING_PROJECT_REF`/`STAGING_DB_PASSWORD`, var `STAGING_ALIAS`, branch protection en `main` (1 approval + 5 checks + no force-push), reviewer en `Production`. Vercel: 8 env vars scoped a la rama `staging` en el proyecto `licitaai`. Ramas `architecture/p2-production-readiness` y `staging` en origin. Fixes de CI aplicados: `typecheck` ahora corre `next typegen` primero; `staging.yml` verifica migraciones con `db start`+`db reset` (no el stack completo). Detalle: `runbooks/setup-staging.md`. Pendiente menor: `PRODUCTION_PROJECT_REF`/`PRODUCTION_DB_PASSWORD` (cuando exista el proyecto de prod). |
| A2 | **Decisión de PITR**: aprobar el add-on (~$100/mes) **o** firmar la aceptación del RPO interino de 24 h (cierra R9) | criterio de terminación de P2.7 | Negocio | S | ⏳ brief + plantilla de firma: [`17-decisiones-negocio.md`](17-decisiones-negocio.md) §A2 |
| A3 | **Términos de uso + DPA**: divulgar que el contenido sale a Anthropic/OpenAI; firmar DPA con retención cero / no-entrenamiento (cierra R7) | lanzamiento a clientes reales | Legal + Producto | S | ⏳ texto propuesto de términos + cláusula de DPA + anexo de subprocesadores: [`17-decisiones-negocio.md`](17-decisiones-negocio.md) §A3 |
| A4 | Rotar las API keys de OpenAI y Anthropic compartidas en la validación local | seguridad | Ingeniería / dueño de las keys | S | ✅ borradas del `.env` local y del contenedor edge; **falta que el dueño las revoque en los dashboards de OpenAI y Anthropic** y ponga las nuevas solo en `supabase secrets` de prod |

---

## B. Huecos dentro del alcance de P2 — código, se puede hacer ya

| # | Pendiente | Por qué importa | Estado actual | Esfuerzo |
|---|---|---|---|---|
| B1 | **C6 — respetar `max_concurrent_jobs` por organización en `reclamar_jobs`** | una org con muchos jobs acapara el worker pese a que la columna existe (R13) | columna `ai_org_policy.max_concurrent_jobs` presente; `reclamar_jobs` la ignora | M |
| B2 | **Fairness del worker**: selección round-robin por org en `reclamar_jobs` + métrica de latencia de arranque p95 **por org** en `/admin/salud` | mismo R13; hoy es FIFO global | no implementado | M |
| B3 | **C5 — `ai_cache`**: tabla `ai_cache(content_sha256, prompt_template_id, prompt_version, modelo, resultado_json, tokens…)` + lookup en el worker antes de llamar al proveedor + dedup de embeddings por `content_sha256` | ahorro de costo directo; el flag `ai.cache` ya existe pero no tiene nada detrás | solo la columna `ai_budget_ledger.cache_hit` como placeholder | L |
| B4 | **C4 — aplicar `modelos_permitidos` (allowlist) y `politica_modelo`** en la selección de modelo de los handlers y en `estimar_costo_ia` | control de costo por plan; hoy las columnas existen pero nada las lee | `ai_org_policy.modelos_permitidos` / `politica_modelo` presentes, sin uso | M |
| B5 | **D5 — gate duro de aprobación humana**: bloquear las acciones críticas (liberar propuesta, marcar un requisito como cumplido, generar el paquete de envío) si el `ai_results` del que dependen no está `APROBADO` | hoy solo hay aviso visual (`<AvisoRevisionIA>`); el brief pide que la IA nunca marque cumplimiento de forma automática | `estado_aprobacion` + `aprobar_resultado_ia` existen; falta el gate en RLS / `apiRoute` | M |
| B6 | **D5b — endpoint de comparación de versiones de `ai_results`** (diff entre una versión y la que reemplaza) | revisión humana del historial | no implementado | S |
| B7 | **D7 — suite `tests/evals/`** (ADR 0007): dataset inicial de ~20 casos con salida esperada + casos adversariales de prompt injection + métricas (precisión de extracción, tasa de alucinación) + gate de CI | R6 (prompt injection), R3 (calidad); es el control de calidad de la IA que hoy falta | no existe `tests/evals/` | XL |
| B8 | **D8 — job programado semanal `eval-suite`** + alerta de regresión de calidad | detectar deriva del modelo/prompt | depende de B7 | S |
| B9 | **R11 — higiene de feature flags**: issue de retiro + fecha por cada flag; sección de auditoría de flags en cada release; marcar los kill-switches | evitar ramas muertas y comportamiento sorpresa | 21 flags vivos, sin plan de retiro | S |
| B10 | **Consolidar el `08-clasificacion-datos.md`** que referencian R7 y ADR 0010 → ya existe como `13-clasificacion-datos.md`; arreglar las referencias cruzadas | consistencia de la documentación | referencias rotas en R7 y ADR 0007/0010 | S |
| B11 | **Auditoría de funciones `SECURITY DEFINER` expuestas por RPC** (advisor de Supabase en staging: 14 llamables por `anon`, 27 por `authenticated`). La mayoría es correcta (chequean `auth.uid()` internamente), pero conviene un repaso 1×1: revocar `anon` de las que no lo necesitan (`check_ai_budget`, `estimar_costo_ia`, `registrar_uso_ia`, `presupuesto_ia_disponible`, `ai_policy_de_org`, `reservar_presupuesto_ia`, `liberar_mi_reserva_ia`) y confirmar el resto | endurecimiento; el fix `0df1bc1` ya cubrió las 21 del worker | Supabase advisor `*_security_definer_function_executable` | M |
| B12 | **`set search_path` en 3 trigger functions** (`_audit_log_inmutable`, `_retencion_archive_inmutable`, `_deletion_requests_touch` — advisor `function_search_path_mutable`) y mover `pg_net` fuera de `public` | endurecimiento menor | advisor de staging | S |
| B13 | **Test helpers no deben hardcodear la clave local de Supabase** (`sb_secret_N7UND0…` en 39 archivos → falso positivo de GitHub push protection). Exportarla desde `supabase status` en el test-runner y quitar el fallback. Nota: eliminarla del historial requiere reescribir los ~30 commits del branch | higiene; hoy hay que desbloquear el push a mano cada vez | GitHub push protection | M |

---

## C. Requieren staging/producción o datos reales

| # | Pendiente | Necesita | Esfuerzo |
|---|---|---|---|
| C1 | **H7 — drill de restauración real**: restaurar el último backup a un proyecto Supabase aislado, correr `restore-verify.mjs` + `smoke.mjs`, medir RTO, documentar en `14-backup-y-restauracion.md` §5 (cierra R8, R10) | proyecto Supabase aislado (A1 o uno efímero) | M |
| C2 | **Baseline de rendimiento (F)**: top-10 de consultas desde `pg_stat_statements` en prod → plan de índices dirigido; fijar LCP/INP/CLS como gate real | 2–4 semanas de tráfico real | M |
| C3 | **F5 — calibrar `hnsw.ef_search`**: medir recall vs latencia reales de pgvector con un corpus representativo y fijar el parámetro | corpus de documentos reales | S |
| C4 | **J-16 — auditoría de accesibilidad** con lector de pantalla (VoiceOver/NVDA) sobre el flujo crítico; checklist en `15-pruebas-aceptacion.md` §5 | despliegue navegable | M |
| C5 | **J-17 — Core Web Vitals de campo** (RUM): instrumentar y vigilar LCP/INP/CLS reales | despliegue con usuarios | S |
| C6 | **Carga sostenida con IA real**: decenas de `analizar-bases` concurrentes para ver el circuit breaker bajo throttling real de Anthropic (429) y la cola con latencia de proveedor de 20–30 s/job (`tests/load/carga-ia-real.mjs`, subir `CARGA_IA_ANALISIS`) | presupuesto de IA (~$0.03/job) | S |
| C7 | **R3/R4 — calibración continua**: recalibración mensual de los factores de `ai-estimate.ts` con datos estimado/real; alerta si la desviación sistemática > 20 %; revisión trimestral de `ai_model_pricing` | 1 mes de datos de conciliación | S (recurrente) |

---

## D. Post-despliegue — tras estabilizar cada flag al 100 %

| # | Pendiente | Cuándo | Esfuerzo |
|---|---|---|---|
| D1 | **B11 — retirar el modo síncrono** de cada operación migrada: subir su `jobs.async_*` a 100 %, esperar ~2 semanas estable, borrar el código sync de la ruta y su rama | por operación, tras 2 semanas verde | M (total) |
| D2 | **B follow-up — re-particionar en steps** `generar-propuesta-tecnica` y `generar-estudio-mercado` (web_search) si en producción rebasan el wall-clock de Edge Functions (R1). Medir primero con `metricas_operacion` | si los datos muestran `EXPIRED`/timeouts en esos tipos | L |
| D3 | **Retirar los flags ya consolidados** (B9) y limpiar el código muerto | tras D1 | S |

---

## E. Follow-ups — cada uno es su propia fase con su ADR

| # | Pendiente | Nota | Esfuerzo |
|---|---|---|---|
| E1 | **Roles y permisos configurables por organización**: tabla `permisos_rol` + helper `tiene_capacidad()` (SECURITY DEFINER) + migrar `is_write_role()`/`rolesPermitidos` con expand→migrate→contract | toca casi toda la RLS; `12-producto.md` | XL |
| E2 | **Versionado de formatos legales**: tabla `formato_legal(version, jurisdiccion, cuerpo, vigente_desde)` + seed desde `src/lib/documentos-legales.ts` como v1 + selección por jurisdicción de la org | análogo a `prompt_templates`; aditivo; `12-producto.md` | M |

---

## Orden sugerido

1. **A4** (rotar keys) — ahora.
2. **A1 + A2 + A3** en paralelo (decisiones) → desbloquea C1, C2, C4, C5.
3. **B1 → B2 → B5 → B4 → B3** (huecos de código con impacto directo en costo/seguridad/fairness).
4. **B9 + B10** (higiene barata).
5. **B7 → B8** (evals — el bloque grande de calidad de IA).
6. Con staging arriba: **C1** (drill), luego **C3/C6** (mediciones baratas).
7. Tras 2 semanas de tráfico: **C2/C7** y arrancar **D1**.
8. **E1/E2** cuando el producto lo pida, cada uno con su propio diseño.
