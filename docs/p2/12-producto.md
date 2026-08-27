# P2 · Entregable 10 (parcial) — Preparación de producto (Fase I6–I8 / P2.10)

Lo transversal de operación (dashboard, SLO, runbooks) está en
`10-slo-y-alertas.md`. Esto cubre los items de "preparación de producto"
del brief.

---

## Hecho

| Item del brief | Implementación |
|---|---|
| **Onboarding seguro** | Ya existente (P0.1): alta por `signup_ticket` / invitación de un solo uso; `handle_new_user()` deriva organización/rol server-side |
| **Planes y límites** | `organizations.plan` (BASE/PRO/ENTERPRISE) + `aplicar_plan_a_org(org, plan)` que fija `ai_org_policy` (cuota mensual $15/$60/$300, diario, concurrencia). Solo `service_role` (panel admin / onboarding) |
| **Estado de servicios** | `/estado` (página pública) + `GET /api/estado`: estado operativo de la app y de cada proveedor de IA (desde `provider_health`), sin datos sensibles. En `PUBLIC_PATHS` del middleware |
| **Exportación de datos** | Job `exportar-organizacion` diseñado en `04-rollback-y-dr.md`; implementación en Fase H |
| **Historial de actividad** | `GET /api/organizacion/actividad`: `actividad_log` (cross-licitación, paginado) + `audit_log` (bitácora inmutable). RLS por organización |
| **Auditoría inmutable para acciones críticas** | `audit_log` append-only **encadenado por hash** (`hash = sha256(prev_hash ‖ fila ‖ ts)`); triggers que rechazan UPDATE/DELETE incluso para el owner; `registrar_auditoria()` (única vía de escritura) y `verificar_cadena_auditoria(org)`. Cableado en: `licitacion_enviada`, `ai_result_revision`, `terminos_aceptados`. Extender al resto de acciones críticas es aditivo |
| **Avisos de que la IA requiere revisión humana** | `<AvisoRevisionIA>` (borrador / aprobado) + estados `PENDIENTE`/`APROBADO`/`RECHAZADO` en `ai_results` (D5). Integrado en `analisis-ia-tab`; patrón para el resto de tabs con salida de IA |
| **Consentimiento y términos de uso** | `users.terminos_aceptados_at` / `terminos_version`; página `/terminos` (gate en el layout del dashboard, `TERMINOS_GATE=off` lo desactiva en e2e); `POST /api/terminos/aceptar` (registra en `audit_log`). Al subir `TERMINOS_VERSION` todos re-aceptan |
| **Flujo para reportar resultados incorrectos** | `POST /api/ai-results/[id]/revision` con `estado: RECHAZADO` + `motivo` → `ai_results` RECHAZADO + `actividad_log` + `audit_log` (D6) |
| **Métricas de valor** | `metricas_valor()` (keyed por `auth.uid()`) + `GET /api/organizacion/metricas-valor` (ADMIN/MANAGER) + `<MetricasValorCard>` en `/configuracion`: documentos procesados, análisis generados, requisitos detectados, **tasa de aceptación humana**, resultados rechazados (≈ omisiones evitadas), **coste de IA por expediente**, licitaciones enviadas |
| **Config por jurisdicción** | `organizations.jurisdiccion` + `estados_config` (ya existente, FEDERAL/EDOMEX/CDMX con portal, sistema, requisitos extra) |

## Follow-up (no en este incremento)

### Roles y permisos configurables "sin romper el modelo base"

El modelo actual (`users.rol` ADMIN/MANAGER/ANALYST/VIEWER + `rol_jerarquico`
EJECUTOR/INTEGRADOR/SUPERVISOR) está cableado en **RLS** (`is_write_role()`,
`user_rol()`) y en `apiRoute({ rolesPermitidos })`. Hacerlo configurable por
organización sin debilitar el aislamiento requiere:

1. Una tabla `permisos_rol (organization_id, rol, capacidad, permitido)` con
   un set cerrado de `capacidad` (p. ej. `escribir_licitacion`,
   `liberar`, `invitar_staff`, `ver_costos`, `aprobar_ia`).
2. Un helper `tiene_capacidad(cap)` (SECURITY DEFINER) que resuelve
   rol → capacidad con los defaults del modelo base y el override de la
   tabla; usado en RLS y en `apiRoute`.
3. Migrar `is_write_role()` / `rolesPermitidos` a `tiene_capacidad()` de
   forma que el comportamiento por defecto sea idéntico (expand →
   migrate → contract).

Es un cambio grande y sensible (toca casi toda la RLS); se hace como su
propia fase con su ADR, no dentro de P2·I.

### Versionado de formatos legales

Hoy las plantillas de documentos legales viven en código
(`src/lib/documentos-legales.ts`, `documentos-tecnicos.ts`). Versionarlas:
una tabla `formato_legal (id, version, jurisdiccion, cuerpo, vigente_desde)`
+ seed desde el código actual como version 1, y que el generador
seleccione la versión vigente para la jurisdicción de la organización.
Análogo a `prompt_templates` (D2). Aditivo, pero fuera del alcance de este
incremento.
