# Runbook — Migración fallida

**Sev:** SEV1 si dejó la base inconsistente en producción; SEV2 si falló en
staging o antes de aplicar.

## Prevención (ya en el pipeline)

`staging.yml` / `production.yml` ejecutan, **antes** de cualquier
`db push`:

1. `npm run lint:migrations` — bloquea sentencias destructivas sin marcar.
2. `supabase db reset` contra una base limpia — la migración debe aplicar
   de cero sin error.
3. `production.yml` además hace `supabase db dump` (respaldo, artefacto 30
   días) antes de aplicar.

## Síntoma

`supabase db push` falla a mitad; el pipeline se detiene. La base puede
quedar con la migración parcialmente aplicada (Supabase envuelve cada
archivo en una transacción, así que normalmente es todo-o-nada — pero
`create index concurrently` y algunas operaciones no son transaccionales).

## Diagnóstico

```sql
-- ¿hasta dónde llegó?
select * from supabase_migrations.schema_migrations order by version desc limit 5;
-- ¿el objeto que la migración intentaba crear existe a medias?
```

## Mitigación

### A) La migración no se registró (rollback automático de la transacción)

- La base sigue en el estado anterior. Corregir la migración (nuevo commit,
  **no** editar la ya aplicada si otra ya la tiene), volver a lanzar el
  pipeline.

### B) Se registró pero dejó objetos a medias (operación no transaccional)

1. Restaurar desde el `db dump` previo (artefacto del run):
   ```bash
   supabase link --project-ref $PROD_REF
   psql "$DATABASE_URL" < backup/pre-deploy-<ts>.sql
   ```
   o PITR al minuto anterior al despliegue (si está habilitado).
2. Verificar `supabase_migrations.schema_migrations` — quitar la fila de la
   versión fallida si el restore no la removió:
   ```sql
   delete from supabase_migrations.schema_migrations where version = '<version>';
   ```
3. Corregir la migración, relanzar.

### C) Migración correcta pero incompatible con el código desplegado

Si el `db push` funcionó pero el deploy de la app aún no salió (o salió y
rompió): **Vercel Instant Rollback** al build anterior. Si la migración es
aditiva, el código viejo la ignora y no hay problema; si es expand/contract
a medias, volver a `expand` (ver `09-entrega-continua.md` §4).

## Verificación

- `supabase_migrations.schema_migrations` coherente con `supabase/migrations/`.
- `/api/ready` → `postgres: ok`.
- Suite de integración contra el entorno afectado (si es staging).

## Seguimiento

Postmortem. Si fue una operación no transaccional, marcarla y separarla en
su propia migración con la nota correspondiente.
