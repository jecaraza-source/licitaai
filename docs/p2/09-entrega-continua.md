# P2 · Entregable 15 — Pipeline de entrega continua (Fase G)

ADR 0009. Implementa G3–G7. G1 (feature flags) y parte de G2 (`config.toml`)
ya estaban; **provisionar el proyecto Supabase de staging y separar los
secretos requiere autorización de gasto** (ver `05-costos-y-limites.md`).

---

## 1. Ramas y entornos

| Rama | Entorno | Despliega | Aprobación |
|---|---|---|---|
| cualquier `feature/*`, `fix/*`, `architecture/*` | — | — (solo CI) | PR review |
| `staging` | **staging** (proyecto Supabase dedicado) | `staging.yml` | automática al mergear |
| `main` | **production** (proyecto Supabase dedicado) | `production.yml` | **manual** (GitHub Environment con *required reviewers*) |

Flujo: `feature/x` → PR a `main` (CI) → merge → *(opcional)* promover a `staging` cherry-pick / fast-forward → validar → merge a `main` → aprobar el despliegue a producción.

`main` y `staging` con **branch protection**: PR obligatorio, 1 review, *Require review from Code Owners*, checks de CI en verde, sin push directo, historial lineal.

## 2. Workflows

| Archivo | Dispara | Hace |
|---|---|---|
| `.github/workflows/ci.yml` | PR + push a ramas ≠ main/staging | `quality` (typecheck, lint, **lint:migrations**, `npm audit`, build) · `deno-check` · `unit` · `supabase-tests` (integración + e2e contra Supabase local) · `secret-scan` (gitleaks) |
| `.github/workflows/codeql.yml` | PR/push a main + semanal | SAST (security-and-quality) |
| `.github/workflows/staging.yml` | push a `staging` | `check` → verificar migraciones contra base limpia → `supabase db push` (staging) → `functions deploy` → Vercel deploy → **smoke** |
| `.github/workflows/production.yml` | push a `main` | *(espera aprobación)* → `check` → verificar migraciones → **`supabase db dump` (respaldo, artefacto 30 días)** → `supabase db push` (prod) → `functions deploy` → Vercel deploy prod → **smoke** → tag + GitHub Release con notas generadas |

`scripts/smoke.mjs <url>`: `/api/health` 200, `/api/ready` sin 503 (Postgres + Storage OK), `/login` 200, `/` redirige a `/login`.

**No se ejecutan migraciones destructivas automáticas**: el paso "verificar migraciones contra una base limpia" (`supabase db reset`) corre antes de cualquier `db push`, y `lint:migrations` bloquea el merge si hay una sentencia de pérdida de datos sin marcar.

## 3. Secrets y variables requeridos (GitHub)

Configurar en *Settings → Secrets and variables → Actions* (y en el
*Environment* correspondiente para los de despliegue):

| Nombre | Ámbito | Para |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | staging + production | `supabase link` / `db push` / `functions deploy` |
| `STAGING_PROJECT_REF`, `PRODUCTION_PROJECT_REF` | resp. environment | ref del proyecto Supabase |
| `STAGING_DB_PASSWORD`, `PRODUCTION_DB_PASSWORD` | resp. environment | contraseña de la BD (para `db push`/`db dump`) |
| `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | staging + production | despliegue |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | staging (+ production si aplica) | el smoke test salta la protección de Vercel (previews `*.vercel.app` con SSO) — `x-vercel-protection-bypass` |
| var `STAGING_ALIAS` | staging | alias estable del deploy de staging (`licitaai-staging.vercel.app`) |

Los **secretos de la app** (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`,
`RESEND_API_KEY`, `CRON_SECRET`, `JOB_WORKER_SECRET`,
`SUPABASE_SERVICE_ROLE_KEY`, …) viven **solo** en Vercel (por entorno:
Preview/Staging vs Production) y en `supabase secrets` de cada proyecto —
**nunca** en el repo ni en GitHub Actions. Los tests de CI usan las claves
por defecto deterministas de `supabase start` (locales, sin valor fuera del
contenedor).

## 4. Convención de migraciones: expand → migrate → contract

Toda migración es **aditiva** por defecto. Un cambio de esquema que
implique pérdida potencial de datos se parte en 3 PRs/migraciones:

1. **expand** — añadir la columna/tabla/constraint nueva. Reversible.
2. **migrate** — copiar datos (`update ... set nueva = vieja`); el código
   de la app lee de ambos esquemas, controlado por un feature flag.
3. **contract** — quitar lo viejo. La sentencia destructiva se marca:
   ```sql
   -- expand-contract: contract  (columna `vieja` migrada a `nueva` en 20260901..., flag `x` al 100% desde ...)
   alter table t drop column vieja;
   ```

`scripts/lint-migraciones.mjs` (`npm run lint:migrations`, gate de CI)
falla ante `DROP TABLE` / `DROP COLUMN` / `TRUNCATE` / `ALTER COLUMN … TYPE`
/ `DROP CONSTRAINT` (sin `ADD CONSTRAINT` posterior) que no lleven
`-- safe: <razón>` o `-- expand-contract: <fase>` en las 3 líneas previas.
Ignora sentencias dentro de cuerpos de función (`$$…$$`) y texto en
literales de cadena.

## 5. Rollback

| Nivel | Acción | Tiempo |
|---|---|---|
| 1 | Bajar feature flag (`FLAG_<KEY>=off` en Vercel, o la tabla) | < 1 min |
| 2 | Vercel *Instant Rollback* al deploy anterior | 1–3 min |
| 3 | Redeploy de Edge Functions del commit previo | ~5 min |
| 4 | `git revert` + push (dispara el pipeline) | 15–30 min |
| 5 | Revertir migración aditiva con su `down` (comentario `-- Rollback:` en cada archivo) | 15–30 min |
| 6 | Volver de `contract` a `expand` (migración no aditiva a medias) | horas |
| 7 | Restaurar desde `db dump` / PITR | ver `04-rollback-y-dr.md` |

## 6. Estado

- ✅ `ci.yml` reescrito (antes: solo lint+build; e2e contra Supabase remoto).
- ✅ `codeql.yml`, `staging.yml`, `production.yml` nuevos.
- ✅ `scripts/lint-migraciones.mjs`, `scripts/smoke.mjs`, `scripts/test-runner.mjs`.
- ✅ `package.json`: `typecheck`, `lint:migrations`, `test:unit`, `test:integration`, `test:e2e`, `deno:check`, `check`.
- ✅ `CODEOWNERS`, `dependabot.yml`, `pull_request_template.md`, `CHANGELOG.md`.
- ✅ `supabase/config.toml` en el repo (desde A3).
- ⏳ **Pendiente de autorización**: crear el proyecto Supabase de staging, cargar los secrets/vars de GitHub, activar branch protection y el Environment `production` con required reviewers. Los workflows quedan listos y referencian esos nombres.
