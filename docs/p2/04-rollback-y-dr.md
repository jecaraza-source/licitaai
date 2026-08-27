# P2 · Entregable 17 — Plan de rollback consolidado y DR

El rollback **por incremento** está en las tablas de [03-plan-incremental.md](03-plan-incremental.md). Este documento consolida la estrategia y cubre DR.

> **Backup, restauración y decisión de PITR:** [`14-backup-y-restauracion.md`](14-backup-y-restauracion.md) (H6/H7/H8). Lo de abajo es el resumen; el detalle operativo, los scripts y el procedimiento de drill viven allí.

## 1. Principios

1. **Ningún incremento a producción sin autorización explícita.**
2. **Toda migración es aditiva o expand/contract.** Prohibido `DROP COLUMN`/`DROP TABLE`/`TRUNCATE` sobre datos vivos en una sola migración (linter en CI, G7).
3. **Todo cambio de comportamiento va detrás de un feature flag** → el primer rollback siempre es bajar el flag (segundos, sin deploy).
4. **Compatibilidad de lectura**: las tablas de dominio conservan punteros/vistas al estado nuevo, de modo que revertir el código no rompe las lecturas.

## 2. Niveles de rollback (de más rápido a más invasivo)

| Nivel | Acción | Tiempo | Cuándo |
|---|---|---|---|
| 1 | Bajar feature flag (`FLAG_<KEY>=off` o tabla) | < 1 min | Comportamiento nuevo causa errores no críticos |
| 2 | Vercel instant rollback (redeploy del build anterior) | 1–3 min | Regresión en el frontend/API |
| 3 | Redeploy de Edge Functions a la versión previa (`supabase functions deploy` del commit anterior) | 5 min | Bug en el worker o un handler |
| 4 | `git revert` del/los commit(s) del incremento + deploy | 15–30 min | El fix no es un flag; hay que sacar el código |
| 5 | Revertir migración aditiva (`down` script incluido en cada una) | 15–30 min | La migración misma es el problema y nada nuevo depende de ella |
| 6 | Fase `contract` de una migración expand/contract → volver a `expand` | horas | Cambio de esquema no aditivo salió mal (antes de la fase contract) |
| 7 | Restauración desde backup / PITR | ver §3 | Corrupción de datos, borrado accidental, desastre |

## 3. DR — objetivos y procedimiento

- **RPO objetivo: 1 h** (con PITR) / **24 h** (interino con `pg_dump` diario — requiere aceptación formal, R9).
- **RTO objetivo: 4 h.**
- **Frecuencia de backups**: PITR continuo (si se aprueba) + `pg_dump` diario a bucket cifrado (retención 30 d) + sync semanal de Storage.
- **Regiones**: backup en región distinta a la de producción (configurable en el bucket de respaldo).
- **Responsables**: matriz en [runbooks/](runbooks/) (se crea en I4).

### Procedimiento de restauración (borrador, se valida en H7)

```
1. Declarar incidente (SEV1), congelar deploys, activar página de estado.
2. Crear proyecto Supabase aislado ("licitaai-restore-<fecha>").
3. Restaurar Postgres: PITR al timestamp objetivo, o cargar el pg_dump más reciente.
4. Restaurar Storage: sincronizar desde el bucket de respaldo.
5. Re-inyectar secretos desde el gestor (no desde backup).
6. Correr suite de integración + smoke contra el proyecto restaurado.
7. Verificar integridad: conteos por tabla, checksums muestreados de Storage, últimas licitaciones.
8. Repuntar DNS/env vars de la app al proyecto restaurado (o promoverlo).
9. Medir RTO real. Postmortem sin culpables.
```

### Planes específicos

- **Corrupción de migraciones**: restaurar a un punto anterior a la migración; corregir la migración; re-aplicar; validar en staging primero.
- **Borrado accidental de datos**: PITR al minuto previo (si aprobado), o restore selectivo desde `*_archive` / `pg_dump`; si fue una org, revisar `deletion_requests` (la ventana de gracia de 7 días debería haberlo evitado).
- **Worker en bucle de reintentos costoso**: bajar flag del tipo de job; pausar `pg_cron`; drenar DLQ manualmente.

### Evidencia requerida (criterio de terminación)

- [ ] Al menos **una restauración real** ejecutada en proyecto aislado, con RTO medido y documentado (H7).
- [ ] Runbook de restauración validado paso a paso.
- [ ] Drill trimestral agendado.
