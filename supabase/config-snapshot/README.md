# config-snapshot

Snapshots versionados de la configuración operativa de producción
(`feature_flags`, `ai_org_policy`, `ai_model_pricing`, `data_retention_policy`).

Los genera y commitea `.github/workflows/backup.yml` (job `config-snapshot`)
corriendo `scripts/backup-config.mjs` contra producción. Ver
`docs/p2/14-backup-y-restauracion.md`.

`latest.json` es el más reciente; los `YYYY-MM-DD.json` son el historial.
