# Higiene de feature flags (P2 punch-list B9 / R11)

19 flags P2, todos **OFF** hoy. Cada flag es deuda: código con dos caminos
(flag on / off) que hay que mantener hasta retirarlo. Reglas:

1. **Todo flag nace con una fecha de retiro y un dueño.** Un flag sin plan
   de retiro es un bug de proceso.
2. **En cada release**, la sección "Auditoría de flags" del CHANGELOG lista:
   flags nuevos, flags al 100 % ≥ 2 semanas (candidatos a retiro), flags
   vencidos.
3. **Los kill-switches** (que se apagan para mitigar un incidente, no para
   lanzar gradualmente) se marcan como tal y **no se retiran** — son
   permanentes por diseño.
4. Retirar un flag = subirlo a 100 %, esperar ~2 semanas estable, borrar el
   código del camino "off" y la fila del flag, en un commit dedicado.

## Inventario

Leyenda: **Lanzamiento** = se retira tras estabilizar · **Kill-switch** = permanente.

| Flag | Tipo | Qué activa | Retirar después de | Dueño |
|---|---|---|---|---|
| `jobs.api` | Lanzamiento | `POST /api/jobs` (crear jobs desde el cliente) | 2 sem. al 100 % tras habilitar el primer `jobs.async_*` | Plataforma |
| `jobs.async_procesar_documento` | Lanzamiento | procesar-documento vía jobs (piloto) | 2 sem. al 100 % | Plataforma |
| `jobs.async_analizar_bases` | Lanzamiento | analizar-bases vía jobs | 2 sem. al 100 % | Plataforma |
| `jobs.async_estudio_mercado` | Lanzamiento | estudio de mercado vía jobs | 2 sem. al 100 % (riesgo R1: web_search) | Plataforma |
| `jobs.async_preguntas_junta` | Lanzamiento | preguntas de junta vía jobs | 2 sem. al 100 % | Plataforma |
| `jobs.async_propuesta_tecnica` | Lanzamiento | propuesta técnica vía jobs | 2 sem. al 100 % (riesgo R1) | Plataforma |
| `jobs.async_auditar_documento` | Lanzamiento | auditar-documento vía jobs | 2 sem. al 100 % | Plataforma |
| `jobs.async_auditar_expediente` | Lanzamiento | auditar-expediente vía jobs | 2 sem. al 100 % | Plataforma |
| `jobs.async_analizar_fallo` | Lanzamiento | seguimiento/analizar-fallo vía jobs | 2 sem. al 100 % | Plataforma |
| `jobs.async_analizar_doc_corp` | Lanzamiento | analizar-documento-corporativo vía jobs | 2 sem. al 100 % | Plataforma |
| `jobs.async_procesar_referencia` | Lanzamiento | procesar-referencia-legal vía jobs | 2 sem. al 100 % | Plataforma |
| `ai.gobierno_costo` | **Kill-switch** | reserva → conciliación de presupuesto de IA en la creación del job | permanente (apagarlo si el ledger tiene un bug que bloquea jobs legítimos) | FinOps |
| `ai.versionado_resultados` | Lanzamiento | `ai_results` append-only + trazabilidad | 4 sem. al 100 % (es cambio de modelo de datos, no solo de camino) | IA |
| `ai.cache` | Lanzamiento | `ai_cache` (B3 — aún sin implementar detrás del flag) | 2 sem. al 100 % tras implementar B3 | IA / FinOps |
| `resiliencia.circuit_breaker` | **Kill-switch** | circuit breakers por proveedor | permanente (apagarlo si un breaker se abre por un falso positivo y bloquea todo) | Plataforma |
| `perf.virtualizar_tablas` | Lanzamiento | virtualización de las tablas largas | 2 sem. al 100 % | Frontend |
| `retencion.limpieza_automatica` | **Kill-switch** | limpieza de retención en modo real (vs. dry-run) | permanente (apagarlo = volver a dry-run global al instante) | Datos |
| `datos.export_organizacion` | Lanzamiento | autoservicio de export de organización | 2 sem. al 100 % | Producto |
| `datos.borrado_organizacion` | **Kill-switch** | autoservicio de borrado de organización | permanente (operación destructiva; apagarlo deja solo el runbook manual) | Producto + Legal |

## Plantilla para el CHANGELOG de cada release

```markdown
### Auditoría de flags

- **Nuevos**: <flag> (dueño, fecha de retiro objetivo)
- **Candidatos a retiro** (100 % ≥ 2 semanas, sin incidentes): <flag>
- **Vencidos** (pasada la fecha de retiro, aún con dos caminos): <flag> — **acción requerida**
- **Kill-switches** (no se retiran): ai.gobierno_costo, resiliencia.circuit_breaker,
  retencion.limpieza_automatica, datos.borrado_organizacion
```

## Seguimiento

Al habilitar el primer `jobs.async_*` en producción, crear un issue de
retiro por cada flag de "Lanzamiento" con la fecha objetivo calculada, y
enlazarlo desde este documento.
