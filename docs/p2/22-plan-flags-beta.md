# Plan de activación de flags para la beta

Estado al **2026-11-27**. Complementa la Fase 5 de
[`18-camino-a-produccion.md`](18-camino-a-produccion.md) y el inventario de
[`19-higiene-flags.md`](19-higiene-flags.md). Donde este documento y la §5 de
`18` difieran, **manda este**: la §5.1 original tenía un error (ver
"Cómo se evalúa un flag").

Ninguno de los pasos de este documento se ejecuta sin autorización explícita
del dueño del producto. Cada ola es una decisión aparte.

## Cómo se evalúa un flag (lo que importa para el SQL)

Orden en `src/lib/flags.ts` (`evaluarFlag`), gemelo en
`supabase/functions/_shared/flags.ts`:

1. Variable de entorno `FLAG_<KEY>` (`on`/`off`) — gana sobre todo.
2. `orgs_excluidas` → apagado.
3. `orgs_incluidas` → **encendido, aunque `enabled` sea `false`**.
4. `rollout_pct > 0` → `hash(key:orgId) % 100 < rollout_pct`. Si es > 0,
   `enabled` **no se consulta** para organizaciones.
5. `enabled`.

Consecuencias:

- **Piloto = solo `orgs_incluidas`.** No tocar `enabled`. Poner
  `enabled = true` junto con `orgs_incluidas` (como decía la §5.1 original)
  enciende el flag para *todas* las organizaciones.
- Flag desconocido, fila ausente o error de lectura = apagado.
- Caché de 3 s por proceso: un cambio tarda unos segundos en verse.
- `rollout_pct` es estable: subirlo nunca saca a una organización que ya
  estaba dentro.

## Organizaciones piloto

| Organización | id | Rol |
|---|---|---|
| TCI | `07ae46b4-e5ed-4686-8786-270ea4bf080a` | Piloto principal (único uso real) |
| Techcore | `3410dd38-119b-4908-9895-011f2c769b9d` | Segunda organización de la beta |

Las demás organizaciones de producción son de prueba. Techcore no tenía
`ai_org_policy`; se crea sola con los valores por defecto la primera vez que
se reserva presupuesto (15 USD/mes, 2 USD/día, 2 USD/operación, 3 jobs
concurrentes).

## Ola 0 — Preparación (sin tocar flags)

Todo esto debe estar hecho antes de la Ola 1.

| # | Acción | Dueño | Verificación |
|---|---|---|---|
| 0.1 | Rotar las llaves que vencen el 2026-11-29 y actualizar Vercel + secretos de Edge Functions | Dueño del producto | Smoke test de un análisis de IA y del envío de correo |
| 0.2 | Límites de gasto en las consolas de Anthropic y OpenAI | Dueño del producto | Captura del límite configurado. Los topes por organización **no** sustituyen a estos |
| 0.3 | `topes_usd_activos = true` para Techcore (TCI ya lo tiene) | Plataforma | `select organization_id, topes_usd_activos from ai_org_policy;` |
| 0.4 | Aplicar a staging las migraciones que le faltan respecto a producción y repetir el smoke async | Plataforma | `list_migrations` de ambos proyectos igual; job de `procesar-documento` en `completado` |
| 0.5 | Correr el arnés C6 con llaves reales para calibrar los topes | Dueño del producto + Plataforma | Costo por operación medido; ajustar los 2 USD/operación si no alcanzan |
| 0.6 | Confirmar que el cron `/api/cron/job-worker` responde sin 500 y que `CRON_SECRET` existe en Vercel | Plataforma | Logs de Vercel de las últimas 24 h |
| 0.7 | Revisar `/api/ready` y `/admin/salud` en verde | Plataforma | Sin SEV1/SEV2 |

SQL de 0.3:

```sql
update public.ai_org_policy
   set topes_usd_activos = true
 where organization_id = '3410dd38-119b-4908-9895-011f2c769b9d';
-- Si Techcore todavía no tiene fila, se crea sola al primer uso; repetir
-- el update después de ese primer uso.
```

## Ola 1 — Solo TCI, un flag cada 24–48 h

Plantilla (cambiar solo la `key`). **No** toca `enabled`:

```sql
update public.feature_flags
   set orgs_incluidas = array['07ae46b4-e5ed-4686-8786-270ea4bf080a']::uuid[]
 where key = '<flag>';
```

Orden:

1. `resiliencia.circuit_breaker` (kill-switch; protege las siguientes).
2. `ai.gobierno_costo` (kill-switch; debe estar **antes** del primer flag
   async para que cada job tenga reserva de presupuesto).
3. `jobs.async_procesar_documento` — el **único** flujo async cuya UI es
   segura hoy: `documentos-tab.tsx` lanza `procesar-documento` sin leer la
   respuesta.

Después de cada paso, durante la ventana de observación:

- `/admin/salud` sin SEV1/SEV2.
- `select estado, count(*) from jobs group by 1;` — sin acumulación en
  `PENDING`/`RETRYING`/`FAILED`.
- Logs de `/api/cron/job-worker` y de la Edge Function `job-worker` sin 500.
- Gasto del día en `ai_usage_log` dentro de lo esperado.

Cuando TCI termine limpia, repetir con Techcore agregando su id al arreglo:

```sql
update public.feature_flags
   set orgs_incluidas = array[
     '07ae46b4-e5ed-4686-8786-270ea4bf080a',
     '3410dd38-119b-4908-9895-011f2c769b9d'
   ]::uuid[]
 where key = '<flag>';
```

## Ola 2

- `ai.versionado_resultados` (cambia el modelo de datos; retirar a las 4
  semanas al 100 %).
- `ai.cache` solo si la Ola 1 salió limpia y se confirma que hay
  implementación detrás del flag (la doc 19 la marcaba como pendiente).

## Ola 3 — Cambia lo que ve el usuario (decisión del dueño del producto)

- `gate.liberacion_ampliada` y `ai.gate_aprobacion`: modifican el flujo de
  aprobación. Decidir con producto antes de activar.
- `gate.revisor_independiente`: **solo** para organizaciones con 2 o más
  usuarios. Con un solo usuario (TCI y Techcore hoy) el envío queda bloqueado
  porque `src/lib/liberacion.ts` exige pendientes de revisión vacíos
  (`revisionActiva && revisionPendientes.length > 0` bloquea). No hay bypass
  verificado para organizaciones de un solo usuario.

## Bloqueados hasta cambiar código

Con el flag activo, estas rutas responden `202 { job_id, async: true }`. La UI
actual no lo maneja y `<JobStatus>` (`src/components/jobs/job-status.tsx`) no
está conectado a ninguna pantalla:

| Flag | Qué pasa hoy en la UI si se activa |
|---|---|
| `jobs.async_analizar_bases` | `analisis-ia-tab.tsx` hace `setAnalisis(json.data)` con el objeto del job y muestra "Análisis completado" |
| `jobs.async_estudio_mercado` | pantalla no preparada para 202 |
| `jobs.async_preguntas_junta` | ídem |
| `jobs.async_propuesta_tecnica` | ídem |
| `jobs.async_analizar_fallo` | `seguimiento-tab.tsx` espera el resultado en la respuesta |
| `jobs.async_auditar_documento` | el checklist anuncia "analizado con IA" y refresca antes de que termine el job |
| `jobs.async_auditar_expediente` | `auditoria-tab.tsx` lee `data.documentos.fallidos` (ausente en el 202) y puede anunciar éxito mientras los jobs siguen en cola |
| `jobs.async_analizar_doc_corp` | sin verificar; tratar como bloqueado |

**Mantener OFF** hasta conectar `<JobStatus>` en cada pantalla y probarlo en
staging. Es el siguiente PR de la lista.

## No activar en la beta

| Flag | Motivo |
|---|---|
| `jobs.api` | Solo expone `POST /api/jobs` (cliente crea jobs). Ninguna ruta async lo necesita |
| `ai.politica_modelo` | Puede cambiar el modelo usado (económico por defecto); revisar costo/calidad antes |
| `retencion.limpieza_automatica` | Las 7 políticas están `activo=false, dry_run=true`, sin revisar `ultimo_resultado` |
| `datos.borrado_organizacion`, `datos.export_organizacion` | Últimos en el orden de la doc 18; requieren DPA/aviso legal firmado |
| `perf.virtualizar_tablas`, `jobs.async_procesar_referencia` | Sin consumidor en el código; activarlos no hace nada |

## Rollback

De más rápido a más lento, sin deploy en ninguno:

```sql
-- Sacar a una organización
update public.feature_flags
   set orgs_incluidas = array_remove(orgs_incluidas, '<uuid>'::uuid)
 where key = '<flag>';

-- Apagar el piloto de un flag
update public.feature_flags set orgs_incluidas = '{}' where key = '<flag>';

-- Apagar un flag en todas las organizaciones
update public.feature_flags
   set enabled = false, rollout_pct = 0, orgs_incluidas = '{}'
 where key = '<flag>';
```

Interruptor de emergencia sin tocar la base: en Vercel, variable
`FLAG_<KEY>=off` (la key en mayúsculas con `.` y `-` como `_`, por ejemplo
`FLAG_JOBS_ASYNC_PROCESAR_DOCUMENTO=off`). Gana sobre la tabla; requiere
redeploy para que la tome la app y `supabase secrets set` para las Edge
Functions.

Un job ya encolado no se cancela al apagar el flag: termina con el código
async. Para vaciarlos:
marcarlos `CANCELLED` (estados válidos: `PENDING`, `AUTHORIZED`, `RUNNING`,
`RETRYING`, `COMPLETED`, `FAILED`, `CANCELLED`, `EXPIRED`) y revisar antes
que no dejen reservas de presupuesto sin conciliar.

## Criterio para avanzar de ola

- 24–48 h sin SEV1/SEV2 en `/admin/salud`.
- Sin jobs atascados ni errores 5xx en el worker.
- Gasto dentro del tope; `topes_usd_activos` no rechazó operaciones legítimas.
- Registrar cada activación (fecha, flag, organizaciones, quién lo autorizó)
  en `08-progreso.md`.

## Pendientes ajenos a los flags que afectan la beta

- Staging va atrás de producción y el async no se ha ejercitado ahí desde
  2026-08-27 (Ola 0.4).
- Producción no tiene jobs registrados: el flujo async nunca ha corrido allí.
- La Edge Function `test-echo` y 4 organizaciones de prueba siguen en
  producción; decidir si se limpian antes de la beta.
- Aviso legal / DPA (A3) y firma del RPO (A2): del dueño del producto.
