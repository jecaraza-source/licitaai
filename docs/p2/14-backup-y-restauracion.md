# P2 · Entregable 18 — Backup y recuperación (H6 / H7 / H8)

Complementa [`04-rollback-y-dr.md`](04-rollback-y-dr.md) (niveles de
rollback) y el [ADR 0010](adr/0010-retencion-borrado-dr.md). Aquí: qué está
automatizado, cómo se prueba una restauración y la decisión sobre PITR.

## 1. Qué se respalda

| Activo | Mecanismo | Frecuencia | Dónde | RPO |
|---|---|---|---|---|
| **Postgres** (esquema + datos) | `pg_dump` cifrado (`scripts/backup-db.mjs`) vía GitHub Actions (`.github/workflows/backup.yml`) | diario 06:00 UTC | artifact 30 d, o `BACKUP_UPLOAD_CMD` → almacenamiento externo en otra región | **24 h** (interino; ver §4) |
| **Postgres** (PITR) | Supabase PITR | continuo | Supabase | **≤ 1 h** — *pendiente de aprobación de costo (H8)* |
| **Storage** (objetos de cliente) | `scripts/backup-storage.mjs` (manifiesto + checksums; `BACKUP_STORAGE_FULL=1` descarga todo) | semanal | externo | 7 d |
| **Config operativa** (`feature_flags`, `ai_org_policy`, `ai_model_pricing`, `data_retention_policy`) | `scripts/backup-config.mjs` → `supabase/config-snapshot/*.json` commiteado | diario | git (repo privado) | 24 h |
| **Esquema / migraciones / `config.toml`** | git | por commit | git | 0 |
| **Secretos** | gestor externo (1Password/Vault) + procedimiento de rotación documentado | — | fuera de git | N/A — se **re-inyectan**, no se restauran |

`data_retention_policy` en el snapshot conserva `activo`/`dry_run` — una
restauración no debe "despertar" purgas que estaban apagadas.

## 2. Objetivos

- **RPO:** 1 h (con PITR) · 24 h (interino con `pg_dump` — **requiere
  aceptación formal**, riesgo R9 en `06-riesgos-residuales.md`).
- **RTO:** 4 h.
- **Regiones:** el destino de backup debe estar en una región distinta a la
  de producción.
- **Drill:** trimestral (§3).

## 3. Procedimiento de restauración (H7)

> Se ejecuta contra un **proyecto Supabase AISLADO**, nunca contra
> producción. Requiere el proyecto de restauración autorizado (bloqueado
> hoy: presupuesto de infra "ninguno por ahora").

```
1.  Declarar incidente (SEV1), congelar deploys, activar /estado.
2.  Crear proyecto Supabase "licitaai-restore-<fecha>" (misma versión de PG).
3.  Postgres:
      a. PITR al timestamp objetivo (si está habilitado), O
      b. cargar el dump:
         openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_PASSPHRASE \
           -in licitaai-<sello>.sql.gz.enc | gunzip | psql "$RESTORE_DB_URL"
4.  Storage: rsync/upload del backup semanal al bucket del proyecto nuevo.
5.  Config: aplicar supabase/config-snapshot/latest.json (script de carga
    o INSERT ... ON CONFLICT).
6.  Secretos: re-inyectar desde el gestor (NO del backup).
7.  Verificar:
      SUPABASE_URL=<restaurado> SUPABASE_SERVICE_ROLE_KEY=<...> \
        node scripts/restore-verify.mjs        # conteos + funciones + cadena de auditoría
      node scripts/smoke.mjs <url-app-apuntando-al-restaurado>
      npm run test:integration                 # opcional, subconjunto
8.  Comparar los conteos de restore-verify contra el manifiesto del backup.
9.  Repuntar env vars de la app (o promover el proyecto). Medir RTO real.
10. Postmortem sin culpables. Anexar los números al final de este documento.
```

### Planes específicos

- **Corrupción por una migración:** restaurar a un punto anterior a la
  migración → corregir la migración → re-aplicar → validar en staging.
- **Borrado accidental de datos:** PITR al minuto previo, o restore
  selectivo desde `retencion_archive` (`recurso`/`organization_id`) o el
  `pg_dump`. Si fue una organización, revisar `deletion_requests` — la
  ventana de gracia de 7 días debería haberlo evitado; si el borrado ya se
  ejecutó, el manifiesto (`retencion_archive.recurso = 'deletion_manifest'`)
  dice exactamente qué se borró.
- **Worker en bucle costoso:** bajar el flag del tipo de job; pausar
  `pg_cron`; drenar la DLQ a mano.

### Evidencia requerida (criterio de terminación — PENDIENTE)

- [ ] Una restauración real ejecutada en proyecto aislado, con RTO medido.
- [ ] `restore-verify.mjs` + `smoke.mjs` en verde contra el restaurado.
- [ ] Drill trimestral agendado.

Bloqueado por: proyecto Supabase de restauración (no autorizado). El
código y el procedimiento están listos; el drill se corre en cuanto haya
un proyecto donde restaurar.

## 4. Decisión sobre PITR (H8)

| Opción | Costo | RPO | Veredicto |
|---|---|---|---|
| Solo `pg_dump` diario (implementado) | ~$0 (GitHub Actions + almacenamiento) | 24 h | Interino. **Requiere que el negocio acepte por escrito** perder hasta 24 h de datos ante un desastre. |
| Supabase PITR (add-on Pro) | **~$100/mes** | ≤ 1 h (hasta 2 min con retención de 7 d) | **Recomendado** para cuando haya clientes de pago. Restauración asistida por Supabase → RTO menor. |
| WAL-G / réplica propia | infra + operación | minutos | Descartado: complejidad no justificada para esta escala. |

**Recomendación:** activar PITR antes del primer cliente de pago con SLA.
Hasta entonces, `pg_dump` diario + aceptación formal del RPO de 24 h.
Sin decisión aún → el riesgo R9 sigue abierto.

## 5. Registro de drills

| Fecha | Tipo | RTO real | Notas |
|---|---|---|---|
| — | — | — | *(primer drill pendiente de proyecto de restauración)* |
