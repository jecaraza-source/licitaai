# P2 · Camino a producción — paso a paso

Guía autocontenida para llevar el trabajo de las ramas de hardening a
producción **sin ayuda externa**. Cada fase tiene: qué hacer, comandos
exactos, cómo verificar, y cómo revertir.

> ⚠️ **Este despliegue es P0 + P1 + P2, no solo P2.** La rama
> `architecture/p2-production-readiness` está **46 commits por delante de
> `main`** e incluye el endurecimiento de seguridad P0 (signup, RLS,
> Edge Functions), la capa de API P1 y todo P2. Producción
> (`xvkgcxpzhkazhnqbtvou`) tiene **35 migraciones**; la rama trae **25
> nuevas** (3 de P0 + 22 de P1/P2). El `db dump` de respaldo previo (paso
> 4.3) NO es opcional.

---

## Estado actual (lo que ya está hecho)

| | Estado |
|---|---|
| **Staging Supabase** `licitaai-staging` (`vuoimnwhxzlfelacvinf`, us-east-1) | ✅ 59 migraciones, 12 functions, 6 secrets |
| **Staging Vercel** | ✅ 8 env vars scoped a la rama `staging`; `licitaai-staging.vercel.app` |
| **Pipeline `staging.yml`** | ✅ verde de punta a punta (check → migraciones → functions → Vercel → smoke) |
| **GitHub: branch protection en `main`** | ✅ 1 approval + 5 checks + no force-push |
| **GitHub: env `staging`** | ✅ `STAGING_PROJECT_REF`, `STAGING_DB_PASSWORD` |
| **GitHub: env `Production`** | ✅ required reviewer (jecaraza-source) — **faltan sus secrets** |
| **GitHub: repo secrets** | ✅ `SUPABASE_ACCESS_TOKEN`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `VERCEL_AUTOMATION_BYPASS_SECRET` |
| **Ramas en origin** | ✅ `architecture/p2-production-readiness`, `staging` |
| **Todos los feature flags** | ✅ OFF (en local, staging y —cuando llegue— prod) |

Datos que vas a necesitar:
- Supabase org **TCI** = `sxibctegbmfvskxtyebl`
- Proyecto Supabase de **prod** = `xvkgcxpzhkazhnqbtvou` (`licitaai`, us-east-1)
- Vercel team = `team_hdAVYvYiLI0QnMzvblfOZKn4` (`jecaraza-6906s-projects`)
- Vercel proyecto = `prj_pKDUkCFKZZblS13ZAuDitpoi91NA` (`licitaai`)

---

## FASE 0 — Validar P2 en staging (1–2 semanas de soak)

**Objetivo:** ejercitar los flujos nuevos con los flags ENCENDIDOS en
staging antes de que el código toque prod.

### 0.0 Ya está preparado (no repetir)

- **Usuario de prueba** en staging: `staging-admin@licitaai.test` /
  `StagingTest2026!` (rol ADMIN, org "Prueba Staging iqxdx3"
  `bd7112ef-62e2-4c6a-b9d4-d4e993376362`, plan BASE con `ai_org_policy`).
- **Worker corriendo**: Vercel Cron NO corre en deployments de preview, así
  que en staging el worker lo dispara **pg_cron** (`p2-job-worker-tick`,
  cada 30s → `disparar_worker()` → POST al edge function). Config en
  `app_settings` (`worker_url` / `worker_secret`). Verificado: un job
  `noop` pasa AUTHORIZED→COMPLETED en ~25s.
- **`PLATFORM_ADMIN_EMAILS`** de staging incluye `staging-admin@licitaai.test`.
- **Flags piloto YA activos**: `jobs.api`, `jobs.async_procesar_documento`.

### 0.1 Entrar a staging

`https://licitaai-staging.vercel.app` — el preview tiene SSO de Vercel.
Dos formas:
- **Con login de Vercel** (si tu cuenta está en el team): entras directo.
- **Sin login**: añade `?x-vercel-protection-bypass=<SECRET>&x-vercel-set-bypass-cookie=true`
  a la primera URL que abras (el `<SECRET>` es el valor del GitHub secret
  `VERCEL_AUTOMATION_BYPASS_SECRET`); Vercel te pone una cookie y el resto
  de la navegación funciona.

Login con `staging-admin@licitaai.test` / `StagingTest2026!`.

### 0.2 Probar el flujo piloto

1. Crear una licitación (Licitaciones → Nueva).
2. Subir un documento (pestaña Documentos). Con `jobs.async_procesar_documento`
   ON, se encola un job en vez de procesarse en la request.
3. Ver el `<JobStatus>` avanzar (Realtime) hasta "completado".
4. En Studio de staging: `select * from jobs order by created_at desc limit 5;`
   → el job en COMPLETED, `intentos = 1`.
5. `select * from document_chunks where documento_id = '<id>';` → chunks con
   embedding real (OpenAI está configurado en staging).
6. `GET /admin/salud` en la app → métricas de operación, sin SEV1/SEV2.

### 0.3 Ir sumando flags conforme cada flujo pasa

Studio de staging → SQL Editor:

```sql
update public.feature_flags set enabled = true where key = 'ai.gobierno_costo';
update public.feature_flags set enabled = true where key = 'ai.versionado_resultados';
update public.feature_flags set enabled = true where key = 'jobs.async_analizar_bases';
-- ... el resto de jobs.async_*, resiliencia.circuit_breaker, etc.
```

### 0.4 Correr la validación de carga contra staging

```bash
SUPABASE_URL=https://vuoimnwhxzlfelacvinf.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service_role de staging — Studio → Settings → API> \
CARGA_ORGS=20 CARGA_JOBS_POR_ORG=25 node tests/load/carga-local.mjs
```

### ✅ Criterio para pasar de fase
- Todos los flujos de IA funcionan async en staging con los flags ON.
- `/admin/salud` sin SEV1/SEV2 sostenidos.
- El monitoreo (`/api/cron/monitoreo`, corre solo por Vercel Cron) no dispara alertas.

### ↩ Rollback
`update public.feature_flags set enabled = false where key = '…';` — segundos.

---

## FASE 1 — Decisiones de negocio (en paralelo con la Fase 0)

Ver **`17-decisiones-negocio.md`**. Dos firmas:

### 1.1 A2 — RPO / PITR
- **Opción A:** aprobar el add-on PITR (~$100/mes) en el plan del proyecto
  de prod. Supabase → proyecto `licitaai` → Settings → Add-ons →
  Point-in-Time Recovery.
- **Opción B:** firmar la aceptación del RPO de 24 h (`pg_dump` diario).
  Guardar el documento firmado.

### 1.2 A3 — Subprocesadores de IA
- Legal revisa el texto de términos de uso + cláusula de DPA de
  `17-decisiones-negocio.md` §A3.
- Firmar los DPA de Anthropic y OpenAI en modo retención cero /
  no-entrenamiento.

### 1.3 (si Opción B) activar el backup interino
GitHub → Settings → Secrets → environment `Production`:
- `SUPABASE_DB_URL_RO` — connection string de solo lectura de prod
  (Supabase → Settings → Database → Connection string, modo *Session*).
- `BACKUP_PASSPHRASE` — frase aleatoria para el cifrado.
- (opcional) `BACKUP_UPLOAD_CMD` — comando de subida a almacenamiento
  externo en otra región.

El workflow `backup.yml` ya corre diario y se auto-salta si faltan estos secrets.

---

## FASE 2 — PR y merge a `main`

### 2.1 Abrir el PR

```bash
gh pr create --repo jecaraza-source/licitaai \
  --base main --head architecture/p2-production-readiness \
  --title "P0 + P1 + P2 — hardening, capa de API, preparación de producción" \
  --body-file docs/p2/07-borrador-pr.md
```

### 2.2 Esperar los checks

El PR dispara `ci.yml`: `quality`, `deno-check`, `unit`, `supabase-tests`,
`secret-scan`. Los 5 tienen que quedar en verde (la branch protection lo exige).

> Si `secret-scan` (gitleaks) o el push protection se queja de
> `sb_secret_N7UND0…`: es la clave local por defecto de Supabase en los
> archivos de test (ver pendiente B13). Ya está permitida en el repo; si
> reaparece, permitir el patrón en Settings → Code security.

### 2.3 Revisar y aprobar

- Usar el checklist de `07-borrador-pr.md` (migraciones aditivas, flags
  OFF, cascade no es el único plan de borrado, funciones del worker no
  ejecutables por `authenticated`).
- 1 approval. **Merge con "Create a merge commit"** (no squash — se pierde
  el historial de P0/P1/P2 y los trailers).

### 2.4 El merge a `main` dispara `production.yml`

→ Fase 4. **El job queda EN ESPERA de aprobación del reviewer** (no toca
prod hasta que alguien apruebe en GitHub → Actions → el run → "Review
deployments").

### ↩ Rollback
Antes de aprobar el deployment: no hacer nada, el run expira. Después:
Fase 4 §rollback.

---

## FASE 3 — Preparar producción (ANTES de aprobar el deployment de la Fase 4)

### 3.1 Secrets de GitHub para el environment `Production`

Supabase → proyecto `licitaai` (prod) → Settings → Database → si no
conservas la contraseña, **Reset database password** y guárdala.

```bash
REPO=jecaraza-source/licitaai
gh secret set PRODUCTION_PROJECT_REF --repo $REPO --env production --body "xvkgcxpzhkazhnqbtvou"
gh secret set PRODUCTION_DB_PASSWORD --repo $REPO --env production --body "<la contraseña de la BD de prod>"
```

### 3.2 Secrets de las Edge Functions en el proyecto de prod

```bash
supabase secrets set --project-ref xvkgcxpzhkazhnqbtvou \
  ANTHROPIC_API_KEY=sk-ant-... \
  OPENAI_API_KEY=sk-proj-... \
  RESEND_API_KEY=re_... \
  RESEND_FROM_EMAIL="LicitaAI <no-reply@tu-dominio-verificado>" \
  JOB_WORKER_SECRET=$(openssl rand -hex 24) \
  CRON_SECRET=$(openssl rand -hex 24)
```

Anota el `CRON_SECRET` que generes — lo necesitas en el paso 3.3.

### 3.3 Env vars de la app en Vercel (environment **Production**)

Vercel → proyecto `licitaai` → Settings → Environment Variables → para
cada una, Environment = **Production**:

| Variable | Valor |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xvkgcxpzhkazhnqbtvou.supabase.co` *(ya existe — verificar)* |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon/publishable key de prod *(ya existe — verificar)* |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role de prod *(ya existe — verificar)* |
| `CRON_SECRET` | **el mismo valor que pusiste en 3.2** |
| `PLATFORM_ADMIN_EMAILS` | correos de los admin de plataforma, separados por coma |
| `NEXT_PUBLIC_APP_URL` | la URL pública de producción |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | *(ya existen — verificar el FROM)* |
| `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_DSN` | opcional, recomendado |
| `FLAG_*` | **no definir ninguna** |

> `CRON_SECRET` **debe coincidir** entre Vercel (Production) y
> `supabase secrets` — lo usan `/api/cron/*`.

### 3.4 Verificar que `production.yml` está sano

Ya tiene los mismos fixes que `staging.yml` (typegen, `db start`+`reset`,
`vercel pull` de production, smoke con bypass). No hay que tocarlo.

### ↩ Rollback
Nada que revertir — solo se cargan credenciales.

---

## FASE 4 — Desplegar a producción

### 4.1 Aprobar el deployment

GitHub → Actions → el run de `Deploy · production` (en espera) → **Review
deployments** → Approve.

### 4.2 El workflow hace, en orden:

1. `npm run check`
2. verificar migraciones contra una base limpia
3. **`supabase db dump` de prod** (esquema + datos) → artifact de 30 días
4. `supabase db push --linked` → aplica las **25 migraciones nuevas** a prod
5. `supabase functions deploy` → sube las 12 Edge Functions a prod
6. `vercel build --prod` + `vercel deploy --prod`
7. `smoke.mjs` contra la URL de producción
8. tag `vAAAA.MM.DD-<sha>` + GitHub Release

### 4.3 Verificación post-deploy

```bash
curl -s https://<tu-dominio>/api/health      # {"status":"ok"}
curl -s https://<tu-dominio>/api/ready        # postgres ok, storage ok, breakers ok
```

En Studio de prod:
```sql
select count(*) from supabase_migrations.schema_migrations;   -- 60
select count(*) from public.feature_flags where enabled;      -- 0
select verificar_cadena_auditoria(id) from organizations limit 5;  -- rota_en = null
```

Vercel Cron: en unos minutos deberían aparecer ejecuciones de
`/api/cron/job-worker` (1 min), `/api/cron/monitoreo`, etc. — revisar sus
logs, no deben 500.

### ↩ Rollback (por gravedad)

| Situación | Acción |
|---|---|
| La app tiene un bug | Vercel → Deployments → deployment anterior → **Instant Rollback** (1–3 min) |
| Un handler / worker falla | `supabase functions deploy` del commit anterior |
| Una migración de datos salió mal | restaurar desde el artifact `db-backup-pre-deploy` (paso 4.2.3): `psql "<PROD_DB_URL>" < backup/pre-deploy-*.sql` — ver `runbooks/migracion-fallida.md` |
| Todo mal | `git revert` del merge commit + push a `main` → re-dispara `production.yml` |

**Nada de esto activa comportamiento nuevo**: los flags están OFF. Un
rollback de código es de bajo riesgo porque el código nuevo está inerte.

---

## FASE 5 — Activación gradual de flags en producción

Una vez el código está en prod y estable (24–48 h), activar **un flag a la
vez, una organización a la vez**.

### 5.1 Activar para una organización piloto

```sql
-- rollout dirigido: solo esta organización
update public.feature_flags
   set orgs_incluidas = array['<uuid-org-piloto>']
 where key = 'jobs.async_procesar_documento';
update public.feature_flags set enabled = true
 where key in ('jobs.api', 'jobs.async_procesar_documento');
```

Vigilar `/admin/salud` 24 h. Si algo va mal:
`update public.feature_flags set enabled = false where key = '…';`

### 5.2 Ampliar por porcentaje

```sql
update public.feature_flags set rollout_pct = 25 where key = 'jobs.async_procesar_documento';
-- luego 50, 100 conforme se estabiliza
```

### 5.3 Orden sugerido de flags

1. `jobs.api` + `jobs.async_procesar_documento` (piloto B1)
2. `ai.gobierno_costo` + `ai.versionado_resultados`
3. `resiliencia.circuit_breaker`
4. el resto de `jobs.async_*` (una operación por semana)
5. `perf.virtualizar_tablas`
6. `retencion.limpieza_automatica` — **y además** pasar cada
   `data_retention_policy` de `dry_run=true` a `false` una por una,
   revisando `ultimo_resultado` primero
7. `datos.export_organizacion`, `datos.borrado_organizacion`

### ↩ Rollback
Bajar el flag. Siempre segundos, sin deploy.

---

## FASE 6 — Post-despliegue (semanas después)

### 6.1 B11 — retirar el modo síncrono

Por cada operación cuyo `jobs.async_*` lleve **~2 semanas al 100 % estable**:
1. Confirmar en `/admin/salud` que no hay fallback a sync.
2. Borrar la rama de código síncrono de la ruta (`if (!async) { … }`).
3. PR normal → `main`.

### 6.2 Retirar los flags consolidados

`delete from feature_flags where key = '…';` una vez el código sync ya no existe.

### 6.3 Drill de restauración (pendiente C1 / H7)

Con staging o un proyecto efímero: restaurar el último `db dump`, correr
`scripts/restore-verify.mjs` + `scripts/smoke.mjs`, medir RTO, anotar en
`14-backup-y-restauracion.md` §5.

---

## ANEXO — Deuda de código (bloque B de `16-pendientes.md`)

**No bloquea el deploy** (los flags están OFF), pero conviene resolverlo
**antes de subir los flags de IA al 100 % con volumen real**:

| # | Qué | Por qué antes de volumen |
|---|---|---|
| B1 | `reclamar_jobs` respeta `max_concurrent_jobs` por org | sin esto una org puede acaparar el worker |
| B2 | fairness del worker (round-robin por org) | mismo motivo |
| B5 | gate **duro** de aprobación humana (D5) | el brief pide que la IA nunca marque cumplimiento automático |
| B4 | aplicar `modelos_permitidos` / `politica_modelo` (C4) | control de costo por plan |
| B3 | `ai_cache` (C5) | ahorro de costo directo |
| B7/B8 | suite de evals (D7/D8) | control de calidad de la IA — es el que más falta |
| B11 | repaso de funciones `SECURITY DEFINER` expuestas por RPC | endurecimiento (advisor de Supabase) |
| B12 | `set search_path` en 3 trigger functions | endurecimiento menor |
| B13 | test helpers no deben hardcodear la clave local de Supabase | quita el falso positivo de push protection |

Cada uno es un PR independiente contra `main` (o `staging` primero). No
hay dependencias fuertes entre ellos salvo B7→B8.

---

## Resumen de "¿qué falta?"

1. **Fase 0** — probar P2 en staging con flags ON (1–2 semanas). *Solo requiere tiempo.*
2. **Fase 1** — firmar A2 y A3. *Negocio + legal.*
3. **Fase 2** — abrir el PR, checks verdes, 1 approval, merge a `main`.
4. **Fase 3** — cargar `PRODUCTION_PROJECT_REF` / `PRODUCTION_DB_PASSWORD` + `supabase secrets` de prod + verificar env vars de Vercel Production.
5. **Fase 4** — aprobar el deployment de `production.yml`. Verificar. (**autorización explícita del punto 8 del brief**)
6. **Fase 5** — activar flags 1×1, 1 org a la vez.
7. **Fase 6** — B11 + limpieza + drill de restauración.

El código está listo. Lo que queda es proceso, decisiones y tiempo de soak.
