# ADR 0009 — Separación de entornos y CI/CD

**Estado:** Propuesto · **Fecha:** 2026-08-26 · **Contexto de:** P2.8

## Contexto

Hoy: un solo proyecto Supabase para todo, secretos en un solo lugar por servicio, sin `.github/workflows`, deploy = push→build de Vercel sin gates. Criterio de terminación: "producción no comparte proyecto ni secretos con desarrollo".

## Decisión

**Proyectos Supabase separados por entorno; env vars y secretos separados en Vercel + `supabase secrets` por proyecto; GitHub Actions con gates y aprobación manual a producción.**

| Entorno | Frontend | Supabase | Secretos |
|---|---|---|---|
| local | `next dev` | `supabase start` (CLI) | `.env.local` (dummy) |
| test (CI) | — | proyecto efímero *o* `supabase db reset` en contenedor | secretos de CI (key de IA de test, budget bajo) |
| preview | Vercel Preview (por PR) | proyecto **staging** (o Supabase branch DB si se adopta) | env "Preview" de Vercel |
| staging | Vercel (rama `staging`) | proyecto **staging** dedicado | env "Preview/Staging" + `supabase secrets` de staging |
| production | Vercel (rama `main`) | proyecto **production** dedicado | env "Production" + `supabase secrets` de prod |

- **`supabase/config.toml`** se añade al repo (hoy no está) con `project_id` por entorno vía `--project-ref`.
- **Workflows**:
  - `ci.yml` (cada PR): `lint`, `tsc`, `build`, `unit`, `integration` (contra test project), `migrations-check` (aplica migraciones a DB limpia; falla si detecta `drop`/`alter ... drop`/`truncate` sin marca `-- p2:expand-contract`), `npm audit`, CodeQL, gitleaks.
  - `preview.yml`: deploy preview + `smoke.yml` (Playwright contra la preview: login, crear licitación, subir doc, encolar un job y verlo COMPLETED).
  - `staging.yml` (push a `staging`): migraciones a staging + deploy + smoke + evals.
  - `production.yml` (push a `main`, **environment con required reviewers**): **backup on-demand de prod** → `migrations-check` → migraciones a prod → deploy → smoke → registrar versión en `CHANGELOG.md` + release notes.
- **Rollback de app**: Vercel instant rollback (redeploy del build anterior).
- **Rollback de DB**: solo migraciones aditivas se revierten con un `down`. Las que cambian datos van en **expand → migrate → contract** (3 PRs): la fase `expand` y `contract` son reversibles; entre ellas, un flag controla qué esquema lee la app.
- **Protección de `main`**: PR obligatorio, 1 review, CODEOWNERS, checks verdes, sin push directo.

## Alternativas descartadas

- **Un proyecto con esquemas separados (`staging`, `prod`)**: no aísla límites de recursos, ni Auth, ni Storage, ni secretos; un error de migración toca ambos.
- **Supabase branching como único mecanismo de staging**: útil para previews, pero staging necesita ser estable y de larga vida → proyecto dedicado. Branching se evalúa como complemento para previews de PR.

## Consecuencias

- Costo: +1 proyecto Supabase (staging) — ver `05-costos-y-limites.md`. El proyecto de test de CI puede ser el mismo de staging con `db reset`, o efímero.
- Hay que migrar los secretos actuales a "Production" explícitamente y crear el set de "Preview/Staging".
- Trabajo inicial de escribir los workflows (~1 incremento).
