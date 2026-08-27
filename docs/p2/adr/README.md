# ADRs — P2 Production Readiness

Registro de decisiones de arquitectura de la fase P2. Formato: contexto → opciones → decisión → consecuencias. Estado inicial de todas: **Propuesto** (pasan a **Aceptado** al aprobarse el diseño, y a **Implementado** al cerrar el incremento correspondiente).

| ADR | Título | Prioridad del brief |
|---|---|---|
| [0001](0001-sustrato-de-jobs.md) | Sustrato de la cola de jobs (tabla Postgres + SKIP LOCKED + pg_cron) | P2.1 |
| [0002](0002-worker-y-limites-de-ejecucion.md) | Worker: modelo de steps y límites de wall-clock | P2.1 |
| [0003](0003-notificacion-de-resultados.md) | Entrega de resultados y progreso (Realtime + polling + email) | P2.1 |
| [0004](0004-gobierno-de-costo-ia.md) | Gobierno y reserva de costo de IA (reserva→ejecución→conciliación) | P2.2 |
| [0005](0005-resiliencia-proveedores.md) | Resiliencia ante fallos de proveedores (circuit breaker, retry v2) | P2.5 |
| [0006](0006-versionado-trazabilidad-ia.md) | Versionado y trazabilidad de resultados de IA (append-only + citas) | P2.3 |
| [0007](0007-evaluaciones-de-ia.md) | Evaluaciones automáticas de calidad de IA | P2.3 |
| [0008](0008-feature-flags.md) | Feature flags (tabla + env, sin proveedor) | P2.8 |
| [0009](0009-separacion-de-entornos.md) | Separación de entornos y CI/CD | P2.8 |
| [0010](0010-retencion-borrado-dr.md) | Retención, borrado de organización y DR | P2.6 / P2.7 |

ADRs pendientes de escribir cuando su fase arranque: observabilidad/dashboard (P2.9), modelo de roles/permisos configurables (P2.10), estrategia de carga y herramienta (P2, Fase J).
