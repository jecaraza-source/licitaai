# Runbook — Poner en marcha staging + producción (A1)

Todo el pipeline de CI/CD (`ci.yml`, `staging.yml`, `production.yml`,
`backup.yml`) ya está escrito y referencia los nombres de secrets/vars de
abajo. Esto es la lista click-by-click para dejarlo operativo. **No
requiere cambios de código.**

Requiere: acceso admin a la organización de Supabase, al proyecto de
Vercel y al repo de GitHub.

---

## 1. Proyecto Supabase de **staging**

1. Supabase → *New project* en la misma organización.
   - Nombre: `licitaai-staging`. Región: la misma que producción.
   - Plan: **Free** basta para staging (sin PITR, sin add-ons).
   - Guarda la **database password** que generes → será `STAGING_DB_PASSWORD`.
2. *Project Settings → General* → copia el **Reference ID** → `STAGING_PROJECT_REF`.
3. *Project Settings → API* → copia `Project URL` y `anon` / `service_role` keys.
4. *Account → Access Tokens* → *Generate new token* (`licitaai-ci`) →
   `SUPABASE_ACCESS_TOKEN` (sirve para staging y prod).
5. Aplica el esquema una vez a mano para verificar:
   ```bash
   supabase link --project-ref <STAGING_PROJECT_REF>
   supabase db push          # aplica las 22 migraciones
   supabase functions deploy # sube las 12 Edge Functions
   ```
6. `supabase secrets set` en el proyecto de staging (ver §4).

## 2. (Cuando toque) Proyecto Supabase de **producción**

Igual que §1 pero:
- Plan **Pro** si se aprueba PITR (ver `17-decisiones-negocio.md` A2).
- `PRODUCTION_PROJECT_REF`, `PRODUCTION_DB_PASSWORD`.
- Para el backup interino: *Project Settings → Database* → **Connection
  string** en modo *Session*, con un rol de solo lectura si es posible →
  `SUPABASE_DB_URL_RO`.

## 3. Vercel

1. El proyecto de Vercel ya existe (la app corre hoy). *Settings → Git* →
   confirma que la rama de producción es `main` y que las Preview
   deployments están activas.
2. *Settings → Environments*: usa **Preview** para staging y **Production**
   para prod. (Opcional: crear un Custom Environment `staging`.)
3. *Account → Tokens* → nuevo token → `VERCEL_TOKEN`.
4. `vercel link` en local (o *Settings → General*) → `VERCEL_ORG_ID`,
   `VERCEL_PROJECT_ID`.
5. Define un dominio/alias estable para staging (p. ej.
   `staging.licitaai.app`) → variable `STAGING_ALIAS`.
6. Carga las **variables de entorno de la app** (§4) en Vercel,
   **por entorno** (Preview vs Production).

## 4. Variables de entorno de runtime

> Nunca en el repo ni en GitHub Actions. Solo en Vercel (app) y
> `supabase secrets` (Edge Functions). En CI los tests usan las claves
> deterministas de `supabase start`.

### 4a. Vercel — app Next.js (Preview **y** Production, con valores distintos)

| Variable | Obligatoria | Valor |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | sí | Project URL del proyecto Supabase de ese entorno |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | sí | anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | sí | service_role key (la usan las rutas de cron y server) |
| `NEXT_PUBLIC_APP_URL` | sí | URL pública de la app en ese entorno |
| `CRON_SECRET` | sí | aleatorio de 32+ hex — **debe coincidir** con el de Vercel Cron; lo usan `/api/cron/*` |
| `PLATFORM_ADMIN_EMAILS` | sí | correos de los admin de plataforma, separados por coma (fail-closed: sin esto `/admin/salud` no deja entrar a nadie) |
| `RESEND_API_KEY` | sí (para notificaciones) | key de Resend |
| `RESEND_FROM_EMAIL` | sí | remitente verificado en Resend |
| `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_DSN` | recomendado | DSN de Sentry (cliente / servidor) |
| `ALERTAS_WEBHOOK_URL` | opcional | webhook de Slack/Teams para SEV1–3 (`/api/cron/monitoreo`) |
| `AI_DAILY_TOKEN_CAP` | opcional | tope global de tokens/día (default en código); red de seguridad de P0.6 |
| `TERMINOS_GATE` | opcional | `off` desactiva el gate de términos (déjalo **sin definir** en prod) |
| `FLAG_*` | **no definir** | todos los feature flags arrancan OFF; se activan por la tabla `feature_flags`, no por env, salvo emergencia |

Vercel Cron ya está declarado en `vercel.json` (`job-worker` 1 min,
`monitoreo` 10 min, `retencion` diario, `borrados` diario,
`alertas-vencimiento` diario). Vercel inyecta el header
`Authorization: Bearer $CRON_SECRET` automáticamente si `CRON_SECRET`
está definido en el entorno.

> ⚠️ **Vercel Cron NO corre en deployments de preview** (solo en
> producción). En un staging que vive como preview de rama, el worker hay
> que dispararlo con **pg_cron** en la BD de staging:
> ```sql
> insert into public.app_settings (key, value) values
>   ('worker_url', 'https://<STAGING_REF>.supabase.co/functions/v1/job-worker'),
>   ('worker_secret', '<JOB_WORKER_SECRET de staging>')
> on conflict (key) do update set value = excluded.value;
> select cron.schedule('p2-job-worker-tick', '30 seconds',
>   $$ select public.disparar_worker(); $$);
> ```
> (Los demás cron —monitoreo, retención, borrados— no son críticos para el
> soak; se pueden agendar igual o dejar para producción.)

### 4b. `supabase secrets set` — Edge Functions (por proyecto: staging y prod)

```bash
supabase secrets set --project-ref <REF> \
  ANTHROPIC_API_KEY=sk-ant-... \
  OPENAI_API_KEY=sk-proj-... \
  RESEND_API_KEY=re_... \
  RESEND_FROM_EMAIL="LicitaAI <no-reply@tu-dominio>" \
  JOB_WORKER_SECRET=<aleatorio 32+ hex>   # o reutiliza el mismo valor que CRON_SECRET
  # opcionales (tienen default en código):
  #   CB_ABIERTO_SEGUNDOS, CB_UMBRAL_FALLOS, JOB_STEP_BUDGET_MS,
  #   JOB_WORKER_BATCH, JOB_WORKER_TICK_BUDGET_MS, JOB_EF_TIMEOUT_MS
```

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` los
inyecta la plataforma en las Edge Functions — **no** los pongas como secret.

`config.toml` ya marca `[functions.job-worker] verify_jwt = false`
(lo autoriza `JOB_WORKER_SECRET` / `CRON_SECRET`, no un JWT de usuario).

### 4c. GitHub Actions — secrets de despliegue

*Settings → Secrets and variables → Actions*. Los marcados con
**(env: X)** van en el *Environment* correspondiente, no como repo secret.

| Nombre | Ámbito |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | repo |
| `STAGING_PROJECT_REF` | env: staging |
| `STAGING_DB_PASSWORD` | env: staging |
| `PRODUCTION_PROJECT_REF` | env: production |
| `PRODUCTION_DB_PASSWORD` | env: production |
| `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | repo |
| var `STAGING_ALIAS` | repo (Variables, no Secrets) |

### 4d. GitHub Actions — secrets de backup (`backup.yml`)

| Nombre | Ámbito | Nota |
|---|---|---|
| `SUPABASE_DB_URL_RO` | env: production | connection string de solo lectura; sin esto el job se **auto-salta** |
| `BACKUP_PASSPHRASE` | env: production | frase para el cifrado del `pg_dump` |
| `BACKUP_UPLOAD_CMD` | env: production (opcional) | comando que sube el `.enc` a almacenamiento externo en otra región; recibe la ruta como `$1`. Sin esto el backup queda como artifact de 30 días |
| `PROD_SUPABASE_URL`, `PROD_SERVICE_ROLE_KEY` | env: production | para el snapshot de `feature_flags` / `ai_org_policy` |

## 5. Ramas y protección

1. Crea la rama `staging` desde `main`:
   ```bash
   git checkout main && git pull && git checkout -b staging && git push -u origin staging
   ```
2. *Settings → Branches → Add rule* para `main`:
   - Require a pull request before merging · **Require approvals: 1**
   - Require status checks: `quality`, `deno-check`, `unit`,
     `supabase-tests`, `secret-scan` (los jobs de `ci.yml`)
   - Require branches to be up to date · Do not allow bypass
3. Misma regla (más laxa si quieres) para `staging`.
4. *Settings → Environments → production* → **Required reviewers** (tú y/o
   quien apruebe releases). `production.yml` espera esa aprobación antes de
   tocar prod.

## 6. Verificación

1. Merge de un cambio trivial a `staging` → `staging.yml` corre entero →
   `smoke.mjs` en verde contra `STAGING_ALIAS`.
2. `curl https://<staging>/api/health` → `200`; `/api/ready` → `200`.
3. `/admin/salud` con un correo de `PLATFORM_ADMIN_EMAILS` → carga.
4. Encola un job `noop` vía SQL en staging y verifica que el worker lo
   completa (Vercel Cron cada minuto).
5. Deja **todos los `feature_flags` en OFF**. La activación por
   organización es un paso posterior y deliberado.

## 7. Después

- `docs/p2/16-pendientes.md` C1 (drill de restauración) ya se puede correr
  usando un proyecto Supabase efímero.
- El primer despliegue a `main`/producción sigue necesitando la
  autorización explícita del punto 8 del brief.
