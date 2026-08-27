# ADR 0010 — Retención, borrado de organización y recuperación ante desastres

**Estado:** Propuesto · **Fecha:** 2026-08-26 · **Contexto de:** P2.6 / P2.7

## Decisión

### Retención
**`data_retention_policy` (por clase de dato) + jobs de limpieza programados (Vercel Cron).**

| Dato | Clase | Retención | Mecanismo |
|---|---|---|---|
| `rate_limit_hits` | log operativo | 7 días | job `limpieza` (o ya se auto-purga por ventana) |
| `ai_usage_log`, `ai_budget_ledger` | fiscal/operativo | 13 meses | job `limpieza` → `*_archive` |
| `jobs` COMPLETED/FAILED/CANCELLED | operativo | 90 días | job → `jobs_archive`, luego borrado a 24 meses |
| `jobs_dead_letter` | operativo | 180 días o hasta resolución | manual + job |
| `document_chunks` de licitaciones CERRADAS | confidencial derivado | 12 meses tras cierre | job: borra embeddings, conserva `documentos` + texto si `analisis` lo referencia |
| `audit_log` | legal | 24 meses mínimo (inmutable) | nunca borrado automático |
| documentos en Storage | confidencial / personal / fiscal | mientras exista la licitación; +N años si fiscal | lifecycle de bucket + verificación en borrado de org |
| `ai_results` | resultado IA | vida de la licitación + 12 meses | job |

### Borrado de organización
**Job `borrar-organizacion` orquestado, NO solo `ON DELETE CASCADE`.**

```
deletion_requests (solicitada_por, org, tipo FULL|USER, estado, programada_para, gracia_dias=7)
  → job borrar-organizacion:
    1. Exportar (job exportar-organizacion) → ZIP a bucket temporal, URL firmada 72 h al admin
    2. Revocar sesiones de la org (GoTrue admin) y desactivar logins
    3. Borrar Storage por prefijo (todos los buckets, org_id/...)
    4. Borrar filas en orden de FK (o dejar el CASCADE de organizations DESPUÉS de 3)
    5. Borrar embeddings / chunks
    6. Cancelar jobs en vuelo de la org
    7. Purgar de logs externos lo posible (Sentry: scrub por org tag; documentar lo que NO se puede)
    8. Registrar en audit_log (fuera de la org, en un espacio de plataforma) con hash del manifiesto de borrado
    9. Confirmar: proveedores de IA — si se usa API con zero-retention, nada que borrar; si no, documentar
```
- **Ventana de gracia** de 7 días (estado `PROGRAMADA`) antes de ejecutar; reversible hasta entonces.
- **Borrado de usuario** individual: reasigna `created_by`/`aprobado_por` a `NULL` (ya es `on delete set null`), revoca sesiones, conserva `audit_log`.

### DR
- **RPO objetivo: 1 hora. RTO objetivo: 4 horas.** (Sujeto a validación con el negocio.)
- **Postgres**: PITR de Supabase (requiere plan Pro + add-on; **decisión de costo pendiente de aprobación** — ver `05-costos-y-limites.md`). Mientras tanto: `pg_dump` diario vía job a un bucket cifrado + retención 30 días.
- **Storage**: no hay PITR nativo → job semanal que sincroniza a un bucket de respaldo (o a almacenamiento externo cifrado); verificación de integridad por conteo + checksums muestreados.
- **Config**: `supabase/config.toml`, migraciones y seeds ya en git; export de flags y `ai_org_policy` a un seed versionado semanalmente.
- **Secretos**: nunca en git; documentados en un gestor (1Password/Vault) con procedimiento de rotación; el runbook de restauración los re-inyecta, no los recupera de un backup.
- **Prueba de restauración real** (P2.7, obligatoria por criterio de terminación): restaurar el último backup a un **proyecto Supabase aislado**, correr la suite de integración + smoke contra él, medir RTO real, documentar en `04-rollback-y-dr.md`. Se repite trimestralmente.
- **Planes específicos**: corrupción de migraciones (restaurar a antes de la migración + re-aplicar corregida) y borrado accidental (PITR al minuto previo, o restore selectivo desde `*_archive` / backup).

## Alternativas descartadas

- **Depender solo de `ON DELETE CASCADE`**: no toca Storage, ni proveedores externos, ni exporta, ni deja rastro — explícitamente prohibido por el brief.
- **Backup externo con herramienta dedicada (e.g. Bruin, WAL-G propio)**: reconsiderar si el `pg_dump` diario resulta insuficiente para el RPO de 1 h; PITR de Supabase es el camino soportado.
