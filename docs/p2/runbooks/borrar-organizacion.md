# Runbook — Borrado de una organización

**Sev:** N/A (operación planificada) · **Reversible:** solo dentro de la ventana de gracia (7 días)

Implementa el ADR 0010. `ON DELETE CASCADE` es el ÚLTIMO paso, nunca el
plan completo.

## Cuándo

- Un cliente pide dar de baja su cuenta (derecho al olvido / fin de contrato).
- Cierre de una organización de prueba con datos reales.

## Flujo normal (autoservicio)

1. Un **ADMIN** de la organización va a Configuración → "Eliminar
   organización", escribe el **nombre exacto** de la organización como
   confirmación → `POST /api/organizacion/borrar`.
2. Se crea `deletion_requests` en estado **PROGRAMADA** con
   `programada_para = now() + 7 días` y se **encola el export**
   (`exportar-organizacion`).
3. Durante la gracia, cualquier ADMIN puede **cancelar**
   (`POST /api/organizacion/borrar/cancelar`) → estado **CANCELADA**.
4. El cron `/api/cron/borrados` (diario):
   - `promover_borrados_vencidos()`: si venció **y el export está
     COMPLETED**, pasa a **EN_PROCESO** y encola `borrar-organizacion`.
   - El job ejecuta, por steps: `preparar` (manifiesto con conteos +
     inventario de Storage) → `revocar` (sesiones + refresh tokens) →
     `storage` (borra `{org}/` en los 5 buckets) → `purgar` (cancela jobs
     en vuelo; **sella** `audit_log` + `retencion_archive` con el
     `sha256` del manifiesto; borra `auth.users` de los miembros).
   - `finalizar_borrados_completados()`: `DELETE FROM organizations`
     (cascade al dominio). Va fuera del job porque el cascade borraría la
     propia fila `jobs`.

## Verificación tras el borrado

```sql
-- la organización ya no existe
select count(*) from organizations where id = '<org>';           -- 0
select count(*) from licitaciones where organization_id = '<org>'; -- 0

-- la evidencia inmutable SÍ existe
select fila->>'manifiesto_sha256', archivado_at
  from retencion_archive where recurso = 'deletion_manifest' and fila_id = '<org>';
select accion, detalle_json->>'manifiesto_sha256', created_at
  from audit_log where recurso_id = '<org>' and accion = 'organizacion_borrada';

-- la cadena de auditoría de la org borrada sigue verificable
select * from verificar_cadena_auditoria('<org>');   -- rota_en = null
```

- Storage: `supabase storage ls` de cada bucket bajo `<org>/` → vacío.
- El export sigue disponible 72 h vía la URL firmada que recibió el ADMIN
  (bucket `exportaciones`, no se borra con la organización).

## Ejecución manual (sin esperar al cron)

```sql
-- forzar el vencimiento de la gracia (SOLO con autorización escrita del cliente)
update deletion_requests set programada_para = now()
 where organization_id = '<org>' and estado = 'PROGRAMADA';

-- correr los pasos del cron a mano (service role):
select promover_borrados_vencidos();
-- ... invocar el worker hasta que el job borrar-organizacion quede COMPLETED ...
select finalizar_borrados_completados();
```

## Si algo falla

| Síntoma | Acción |
|---|---|
| El job `borrar-organizacion` queda en `FAILED` | Revisar `error_interno_ref`. Es reanudable: `update jobs set estado='AUTHORIZED', intentos=0 where id='<job>'`. Cada step es idempotente. |
| `promover` no encola nada | El export no está `COMPLETED`. Revisar el job `exportar-organizacion` (¿Storage lleno?, ¿RPC con error?). |
| El export no cabe en memoria del worker | Organización enorme. Partir `exportar_datos_organizacion` por tabla/paginación (ver `13-clasificacion-datos.md`). |
| `finalizar` da error de FK | Alguna tabla nueva referencia `organizations` sin `ON DELETE CASCADE`. Añadir la cascade (o al plan de borrado) — **el brief prohíbe que el cascade sea el único plan, no que exista**. |

## Datos fuera de nuestro control

- **Sentry**: scrub por tag `organization_id` (ver [fuga-de-datos](fuga-de-datos.md)); lo que la retención de Sentry no deje borrar antes de tiempo se documenta en el issue.
- **Proveedores de IA**: si se usan con retención cero / no-entrenamiento, no hay nada que borrar. Si no, abrir ticket con el proveedor.
- **Resend**: solicitar purga de las direcciones vía su API/soporte.
