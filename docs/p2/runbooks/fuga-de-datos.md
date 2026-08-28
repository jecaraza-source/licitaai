# Runbook — Fuga / exposición de datos

**Sev:** SEV1

Aplica a: acceso de una organización a datos de otra (fallo de aislamiento
multi-tenant), datos personales/fiscales expuestos públicamente, un endpoint
que devuelve más de lo debido, o un tercero (proveedor de IA, log) con datos
que no debería.

## 1. Contener (primero, antes de investigar)

1. **Identificar el vector** — ¿qué ruta/función/consulta? ¿desde cuándo?
2. **Cerrar el vector**:
   - Ruta/EF concreta: bajar su feature flag, o Vercel Instant Rollback al
     build sin el bug, o `supabase functions deploy` de la versión previa.
   - Si es una política RLS mal puesta por una migración: revertir esa
     migración (comentario `-- Rollback:` del archivo) o aplicar un hotfix
     que restaure la política correcta.
3. Si hubo acceso activo de un atacante: [revocar sus sesiones](revocar-sesiones.md).

## 2. Evaluar el alcance

```sql
-- qué organizaciones/recursos pudieron verse afectados: revisar actividad_log,
-- ai_usage_log, y los logs de Edge Functions / Vercel del periodo.
select * from public.actividad_log
 where created_at between '<inicio>' and '<fin>' order by created_at;
```

- ¿Qué datos (clasificación en `08-clasificacion-datos.md`)? Personales /
  fiscales / propuestas económicas / llaves → obligaciones legales.
- ¿Cuántas organizaciones? ¿Datos efectivamente accedidos o solo
  potencialmente expuestos?

## 3. Notificar

- Escalar al **dueño de datos / privacidad** (matriz de responsables).
- Si hay datos personales de terceros involucrados: valorar con legal la
  obligación de notificar (LFPDPPP / autoridad / titulares) y los plazos.
- Preparar comunicación a las organizaciones afectadas (qué pasó, qué datos,
  qué se hizo, qué deben hacer ellas).

## 4. Remediar

- Parche definitivo del bug + **test de regresión** (aislamiento
  multi-tenant) que falle sin el fix.
- Si se filtró a un proveedor de IA: confirmar su política de retención;
  solicitar borrado si aplica; documentar lo que no se puede borrar.
- Rotar credenciales que pudieran haberse expuesto.

## 5. Verificación

- El vector está cerrado (reproducir el acceso y confirmar 403/404).
- La suite de integración de aislamiento (`p0-edge-functions-isolation`,
  `p2-*`) pasa, incluida la nueva regresión.

## Seguimiento

Postmortem sin culpables dentro de 5 días. Acciones sistémicas: ¿por qué
RLS no cubría el caso?, ¿faltaba un test?, ¿el linter/review debió pillarlo?
