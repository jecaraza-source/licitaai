# P2 · Entregable — Clasificación de datos, retención y privacidad (H1)

Base para las políticas de retención (H2), el export (H4) y el borrado
orquestado (H5). Complementa el [ADR 0010](adr/0010-retencion-borrado-dr.md).

## 1. Clases de dato

| Clase | Definición | Trato |
|---|---|---|
| **P — Personal** | Identifica a una persona: nombre, correo, `auth.users`. | Minimizar. Se borra/anonimiza al borrar el usuario o la organización. Nunca en logs. |
| **C — Confidencial de negocio** | Expedientes, propuestas, precios, documentos de la licitación. | Aislado por organización (RLS + prefijo de Storage). Solo sale de la plataforma vía export autenticado. |
| **CD — Confidencial derivado** | Salidas de IA, embeddings, chunks. Reconstruyen (C). | Misma protección que (C). Los embeddings se purgan antes que el texto. |
| **F — Fiscal / contable** | Uso y costo de IA por organización. | 13 meses mínimo (conciliación). Archivo frío después. |
| **L — Legal / auditoría** | `audit_log`, evidencia de envío. | Inmutable, encadenado por hash. 24 meses mínimo. Nunca borrado automático. Sobrevive al borrado de la organización con `organization_id = NULL`. |
| **O — Operativo** | Jobs, dead-letter, actividad, health de proveedores. | Retención corta. Archivo frío para lo que tenga valor forense. |
| **LO — Log operativo efímero** | `rate_limit_hits`. | 7 días. No se archiva. |
| **G — Global de plataforma** | Catálogos: precios de modelos, `feature_flags`, `prompt_templates`, referencias legales, `estados_config`. | Sin datos de cliente. En git / seeds. No entra en export ni en borrado de organización. |

## 2. Etiquetas por tabla

| Tabla | Clase | Ámbito | Retención | Al borrar la organización |
|---|---|---|---|---|
| `users` | P | organización | vida de la cuenta | anonimizar / borrar (ver §4) |
| `organizations` | C | — | vida de la cuenta | borrado (raíz del cascade) |
| `empresa_perfil` | C, P | organización | vida de la cuenta | cascade |
| `documentos_corporativos` | C | organización | vida de la cuenta | cascade + Storage por prefijo |
| `licitaciones` | C | organización | vida de la cuenta | cascade |
| `documentos` | C | licitación | vida de la licitación | cascade + Storage por prefijo |
| `partidas`, `requisitos_tecnicos`, `propuesta_economica_*`, `propuestas`, `responsabilidades_procedimiento`, `viabilidad`, `junta_aclaraciones`, `checklist_*` | C | licitación | vida de la licitación | cascade |
| `analisis_bases`, `estudio_mercado`, `seguimiento`, `evidencia_envio` | C / L (`evidencia_envio`) | licitación | vida de la licitación | cascade |
| `ai_results`, `ai_result_citations` | CD | organización | vida de la licitación + 12 meses | cascade |
| `document_chunks` | CD | licitación | embeddings: 12 meses tras cierre; texto: con el documento | cascade |
| `actividad_log` | O | licitación | 24 meses | cascade |
| `ai_usage_log` | F | organización | 13 meses → archivo | cascade (tras export) |
| `ai_budget_ledger` | F | organización | 13 meses → archivo | cascade (tras export) |
| `ai_org_policy` | O | organización | vida de la cuenta | cascade |
| `jobs` | O | organización | 90 días en estado terminal → archivo | cascade + cancelar en vuelo |
| `jobs_dead_letter` | O | organización | 180 días → archivo | cascade |
| `invitaciones_staff` | P | organización | 30 días tras aceptar/expirar | cascade |
| `signup_tickets` | O | organización | hasta consumo o 7 días | cascade |
| `audit_log` | L | organización (histórica) | 24 meses mínimo, inmutable | se conserva con el `organization_id` histórico (H5 quitó la FK: una bitácora a prueba de manipulación no puede perder el id original; la cadena por hash sigue verificable con `verificar_cadena_auditoria(org)`) |
| `retencion_archive` | F / O | nullable | 24 meses, inmutable | se conserva; la fila `deletion_manifest` (manifiesto + `manifiesto_sha256`) es la evidencia durable del borrado |
| `rate_limit_hits` | LO | usuario | 7 días | cascade |
| `feature_flags`, `prompt_templates`, `ai_model_pricing`, `estados_config`, `checklist_templates`, `provider_health`, `app_settings`, `referencias_legales`, `referencia_legal_*` | G | plataforma | indefinida | intactas |

## 3. Etiquetas por bucket de Storage

| Bucket | Clase | Path | Al borrar la organización |
|---|---|---|---|
| `documentos-originales` | C | `{org}/{licitacion}/…` | borrar prefijo `{org}/` |
| `propuestas-generadas` | C, CD | `{org}/{licitacion}/…` | borrar prefijo `{org}/` |
| `documentos-requeridos` | C | `{org}/{licitacion}/…` | borrar prefijo `{org}/` |
| `documentos-corporativos` | C | `{org}/…` | borrar prefijo `{org}/` |
| `logos-empresa` | C (público) | `{org}/…` | borrar prefijo `{org}/` |
| `exportaciones` | C, CD | `{org}/{deletion_request}/…` | TTL 72 h; borrar prefijo |
| `referencias-legales` | G | global | intacto |

## 4. Borrado de usuario individual (≠ borrado de organización)

- `created_by`, `aprobado_por`, `requested_by`, `user_id` ya son `on delete set null` → el historial queda sin autor pero íntegro.
- Se revocan las sesiones (GoTrue admin) y se borra la fila de `auth.users`.
- `audit_log.actor_id` pasa a `NULL`; la acción y su hash se conservan.
- No dispara export ni toca Storage (los documentos son de la organización, no del usuario).

## 5. Datos fuera de Postgres/Storage

| Sistema | Qué guarda | Al borrar la organización |
|---|---|---|
| **Sentry** | `request_id`, mensajes de error, `organization_id` como tag, sin cuerpo de documento | scrub por tag de organización (script en `runbooks/`); documentar lo que la retención de Sentry no permite borrar antes de tiempo |
| **Vercel logs** | líneas de `console.*`, sin PII de negocio por política de código | retención de la plataforma (según plan); no borrable selectivamente → no se registra PII ahí |
| **Proveedores de IA (Anthropic / OpenAI)** | prompts + respuestas en tránsito | usar API con retención cero / no-entrenamiento; si un proveedor no lo garantiza, documentarlo en el DPA y en `06-riesgos-residuales.md` |
| **Resend (correo)** | direcciones y asuntos de notificaciones | retención del proveedor; se solicita purga vía su API/soporte en el borrado |

## 6. Borrado de organización — flujo implementado (H5)

`deletion_requests` + jobs `exportar-organizacion` y `borrar-organizacion`
(ADR 0010). Runbook: [`runbooks/borrar-organizacion.md`](runbooks/borrar-organizacion.md).

```
solicitar_borrado_organizacion(nombre_exacto)   [ADMIN, confirmación = nombre de la org]
  → deletion_requests PROGRAMADA, programada_para = now() + 7 días
  → encola job exportar-organizacion
[ventana de gracia 7 d — cancelar_borrado_organizacion() revierte]
cron /api/cron/borrados (diario):
  promover_borrados_vencidos()    → si vencida y el export COMPLETED:
                                     EN_PROCESO + encola job borrar-organizacion
  job borrar-organizacion (steps): preparar (manifiesto) → revocar (sesiones +
    refresh tokens) → storage (borra {org}/ en los 5 buckets) → purgar (cancela
    jobs en vuelo; sella audit_log + retencion_archive con sha256 del
    manifiesto; borra auth.users → cascade a public.users)
  finalizar_borrados_completados() → DELETE de organizations (cascade al
                                     dominio). Fuera del job: el cascade
                                     borraría la propia fila `jobs`.
```

Reversible hasta que `programada_para` vence y el job arranca. La evidencia
(hash del manifiesto) queda en `audit_log` (`organizacion_borrada`) y en
`retencion_archive` (`deletion_manifest`), ambos inmutables.

## 7. Principios operativos

1. **Nada de PII de negocio en `console.*` ni en Sentry** salvo identificadores opacos (`organization_id`, `request_id`, `job_id`).
2. **El borrado de organización siempre exporta primero** y deja rastro en `audit_log` + `retencion_archive` (hash del manifiesto).
3. **`ON DELETE CASCADE` nunca es el único plan**: es el último paso del job `borrar-organizacion`, después de Storage, sesiones, jobs en vuelo y export (ADR 0010).
4. **Toda purga por retención arranca en `dry_run`**: pasa a real por `UPDATE` humano de `data_retention_policy`, recurso por recurso.
