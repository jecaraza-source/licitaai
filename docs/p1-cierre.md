# P1 — Estabilización: cierre de fase

**Rama:** `quality/p1-stability-and-testing` (sobre `main`, que ya tiene P0 + P2)
**Commits:** 8, uno por prioridad — `85dd16e` → `c8823d0`
**Estado:** código, migración y tests completos; verificado con `typecheck` / `lint` / `build` / suites unitarias / cobertura y con las suites de integración P1 contra el stack local. **Nada desplegado.** Rama lista para PR.

```
c8823d0 quality(p1.5): extract useRealtimeLista, stabilise effect deps
7118de1 quality(p1.8): dependency hygiene — SBOM, license gate, prune unused
1d05016 quality(p1.7): structured request logging + Sentry scrubbing
e5ec16b quality(p1.6): additional web-layer security
b835224 quality(p1.4): generated Supabase types + drift check + type helpers
8db9217 quality(p1.3): coverage + test-hygiene gates, shared fixtures
5b2dce7 quality(p1.2): transactional integrity + cross-resource consistency
85dd16e quality(p1.1): migrate remaining domain routes to the shared API layer

59 files changed, ~6700 insertions(+), ~1100 deletions(-)
```

## 1. Resumen ejecutivo

### Estado inicial (auditoría en `docs/api-contracts.md`)

- 1 de 59 rutas API sobre la capa común; 57 con validación manual dispar; `error.message` crudo de Postgres/SDK filtrándose en >40 rutas; forma de respuesta inconsistente.
- `propuesta-economica` PUT: delete-then-insert sin transacción (pérdida de datos posible).
- Sin restricción de integridad cross-recurso dentro de una organización.
- Vitest ausente; sin gate de cobertura; sin detección de `.only`.
- Cliente Supabase sin tipar.
- CSP con `unsafe-eval` en producción; sin HSTS; colores de marca sin validar (inyección de CSS por organización).
- Sentry sin scrubber; logging solo en error.
- 3 paquetes langchain sin usar; sin SBOM ni verificación de licencias.
- Suscripciones Realtime y efectos con dependencias silenciadas en los componentes grandes.

### Estado final

| Prioridad | Entregado |
|---|---|
| **P1.1** | Todas las rutas con sesión de usuario sobre `apiRoute()` — sobre uniforme, Zod, `request_id`, cero fugas de mensajes internos |
| **P1.2** | RPC transaccional `guardar_propuesta_economica`; triggers de consistencia cross-recurso (`checklist_items`, `requisitos_tecnicos`, `propuesta_economica_partidas`); compensación Storage corregida; índices |
| **P1.3** | Cobertura `c8` con umbral en CI; gate anti-`.only`; fixtures compartidas A/B + 4 roles; `docs/testing-strategy.md` |
| **P1.4** | Tipos Supabase generados del esquema real + drift-check en CI + helpers `Fila<T>`; `any` en cero |
| **P1.5** | `useRealtimeLista` (estado+consultas+Realtime fuera del componente, limpieza garantizada); `documentos-tab` + `analisis-ia-tab` migrados; deps de efectos estabilizadas |
| **P1.6** | HSTS; `unsafe-eval` fuera de prod; validación hex estricta de colores de marca (2 capas); `sanitize-html.ts` por allowlist en la salida de IA |
| **P1.7** | Log estructurado por request (éxito y error) con redacción; Sentry con `sendDefaultPii:false` + `beforeSend` scrubber |
| **P1.8** | 3 paquetes langchain retirados; `shadcn` a devDeps; `npm run licenses` (gate) + `npm run sbom` en CI; `docs/dependencias.md` |

**Tests:** 13 suites unitarias (incluye 4 nuevas: `sanitize-html`, `theme-colors`, `observabilidad` + hygiene), 2 suites de integración P1 nuevas (`p1-integridad` 9 casos, `p1-fixtures-rls` 8 casos). Cobertura de los módulos de `src/lib` bajo prueba: **97.8 % líneas / 83.8 % ramas** (umbral 80/70).

## 2. Verificaciones ejecutadas

```
npm run typecheck        → 0 errores
npm run lint             → 0 errores, 2 warnings baseline (React Compiler + TanStack Table)
npm run lint:migrations  → OK
npm run test:hygiene     → OK (sin .only)
npm run test:unit        → 13/13 suites
npm run test:coverage    → umbral cumplido (97.8% / 83.8%)
npm run build            → OK
npm run licenses         → OK (344 deps prod, allowlist)
npm audit --omit=dev     → 0 vulnerabilidades
node tests/integration/p1-integridad.test.mjs     → 9/9
node tests/integration/p1-fixtures-rls.test.mjs   → 8/8
```

**No verificado en este entorno** (falta el edge runtime local): la suite de integración P0/P2 completa y la suite e2e Playwright. Corren en CI (`supabase-tests`), que además se amplió en esta fase (hygiene, cobertura, licencias, SBOM, drift de tipos, `--forbid-only`).

## 3. Migración

`20260906000000_p1_integridad.sql` — **aditiva** (1 función, 2 trigger functions + 3 triggers, 4 índices). Ningún `DROP`/`ALTER … DROP` sobre datos.

**Rollback** (en la cabecera del archivo):

```sql
drop function if exists public.guardar_propuesta_economica(uuid, jsonb, jsonb);
drop trigger if exists trg_pe_partida_misma_licitacion on public.propuesta_economica_partidas;
drop trigger if exists trg_checklist_doc_misma_licitacion on public.checklist_items;
drop trigger if exists trg_req_tecnico_doc_misma_licitacion on public.requisitos_tecnicos;
drop function if exists public._partida_pertenece_a_licitacion();
drop function if exists public._documento_pertenece_a_licitacion();
drop index if exists public.checklist_items_documento_id_idx;
drop index if exists public.requisitos_tecnicos_licitacion_id_idx;
drop index if exists public.requisitos_tecnicos_documento_id_idx;
drop index if exists public.propuesta_economica_partidas_partida_id_idx;
```

Revertir la migración **sin** revertir el código deja `propuesta-economica` PUT roto (llama al RPC). Revertir juntos, o solo el código (la ruta vuelve a su versión anterior — está en el historial del commit `5b2dce7`).

## 4. Plan de rollback del código

Cada prioridad es un commit temático; `git revert` en orden inverso es seguro. Ninguna prioridad requiere migración de datos irreversible.

- **P1.1** revertir reintroduce las fugas de `error.message` y la validación manual — no reintroduce ninguna vulnerabilidad (la autorización siempre fue por RLS/sesión).
- **P1.6** revertir quita HSTS y reintroduce el hueco de inyección de CSS por colores de marca — hacerlo solo como mitigación de un incidente causado por esta fase.
- El resto (P1.3/1.4/1.7/1.8) es infraestructura de CI/tipos/logs: revertir no afecta el runtime de la app.

## 5. Riesgos residuales

| # | Riesgo | Mitigación / seguimiento |
|---|---|---|
| R1 | **Cliente Supabase aún sin tipar end-to-end.** Enhebrar `Database` destapa ~43 desajustes de contrato reales | Inventario en `docs/api-contracts.md` §P1.4. Los tipos ya están generados y con drift-check; el pase de reconciliación es su propia tarea |
| R2 | **Split presentación/contenedor de los 8 componentes no hecho** | `docs/refactor-frontend.md`. Requiere ampliar la suite e2e primero (las fixtures de P1.3 son la base) |
| R3 | **Suite integración/e2e no corrida localmente** en esta fase | CI la corre; los cambios de P1 en rutas son de capa Next (Zod, errores), no tocan SQL/RLS/Edge salvo la migración aditiva, que sí se aplicó y probó en local |
| R4 | **`sanitizarHtml` no está en la Edge Function `generar-propuesta-tecnica`** (Deno) | Se sanea al guardar (`PUT propuesta-tecnica`), que cubre el contenido persistido. Replicar en Deno es follow-up (`docs/seguridad-web.md`) |
| R5 | **CSP sigue con `script-src 'unsafe-inline'`** | Migrar a nonces requiere middleware; documentado como siguiente paso en `docs/seguridad-web.md` |
| R6 | **Gate de cobertura acotado a 8 módulos de `src/lib`** | Es deliberado (rutas/componentes se cubren con integración/e2e). Ampliar el `include` cuando haya tests unitarios de más módulos |
| R7 | **CI en rama protegida no falla aún si faltan `TEST_USER_*`** (los e2e se auto-omiten) | `docs/testing-strategy.md` — se cierra con un paso `if: github.ref == 'refs/heads/main'` |

## 6. Borrador de PR

**Título:** `quality: P1 stability & testing (API layer, integrity, tests, types, security, observability, deps, frontend)`

**Cuerpo:**

```markdown
## Resumen

Ocho prioridades P1, un commit cada una — ver `docs/p1-cierre.md`.

- **P1.1** — todas las rutas API con sesión sobre `apiRoute()`: sobre
  `{data,error,meta}`, Zod, request_id, sin fugas de errores internos.
- **P1.2** — RPC transaccional para la propuesta económica; triggers de
  consistencia cross-recurso; compensación de Storage corregida.
- **P1.3** — gate de cobertura (c8) y de higiene (`.only`) en CI;
  fixtures compartidas.
- **P1.4** — tipos Supabase generados del esquema real + drift-check.
- **P1.5** — `useRealtimeLista`; deps de efectos estabilizadas.
- **P1.6** — HSTS; `unsafe-eval` fuera de prod; validación de colores de
  marca (inyección de CSS); saneado de HTML de IA por allowlist.
- **P1.7** — log estructurado por request; Sentry con scrubber y sin PII.
- **P1.8** — 3 paquetes sin uso retirados; gate de licencias + SBOM.

Migración `20260906000000_p1_integridad.sql` — aditiva, rollback en la
cabecera.

## Test plan

- [ ] `npm run check` (typecheck + lint + lint:migrations + hygiene)
- [ ] `npm run test:coverage` — umbral cumplido
- [ ] `npm run build`
- [ ] `npm run licenses` · `npm audit --omit=dev`
- [ ] CI `supabase-tests` verde (integración P0/P1/P2 + e2e)
- [ ] Revisión de `docs/p1-cierre.md` (rollback, riesgos residuales) por
      un revisor humano antes de mergear

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

## 7. Recomendación

P1 deja la plataforma con contrato de API uniforme, integridad transaccional en el punto que podía perder datos, gates de CI que antes no existían (cobertura, higiene, licencias, drift de tipos), y el logging/Sentry saneados. Los dos pendientes de peso —tipado end-to-end del cliente (R1) y el split de componentes (R2)— están inventariados y no bloquean el despliegue: son deuda acotada, no riesgo abierto.

Recomendación: **apto para PR y, tras revisión humana de la migración y los riesgos residuales, para el flujo de despliegue de staging.**
