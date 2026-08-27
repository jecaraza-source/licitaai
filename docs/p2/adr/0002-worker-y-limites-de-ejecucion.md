# ADR 0002 — Worker: modelo de ejecución y límites de wall-clock

**Estado:** Propuesto · **Fecha:** 2026-08-26 · **Contexto de:** P2.1

## Contexto

Supabase Edge Functions tienen un límite de wall-clock (~150 s free, ~400 s CPU plan Pro; el tiempo de espera de red a un proveedor de IA cuenta contra el wall-clock). Vercel Functions llegan a 300 s (Pro/Fluid). Varias operaciones (procesar un PDF escaneado grande, generar una propuesta técnica larga, `auditar-todos`) pueden exceder cualquiera de esos límites. Necesitamos ejecución que no dependa de que una sola invocación dure toda la operación.

## Decisión

**Modelo de steps con re-encolado.** Cada tipo de job define una secuencia de steps idempotentes:

| Tipo de job | Steps |
|---|---|
| `procesar-documento` | `descargar+validar` → `extraer-texto` (pdf-parse o Claude) → `chunk` → `embeddings` (lote a lote, N por step) → `finalizar` |
| `analizar-bases` | `preparar-contexto` → `llamar-modelo` → `validar-esquema+persistir` |
| `auditar-expediente` | `enumerar-items` → `auditar-item` (uno por step, con `prioridad` y concurrencia por org) → `auditar-expediente` → `consolidar` |
| resto | típicamente `preparar` → `llamar-modelo` → `persistir` |

- El worker toma un job, ejecuta **un step**, escribe `progreso` + `result_ref` parcial + `step_actual`, y:
  - si quedan steps → `estado = AUTHORIZED` de nuevo (re-encolado), `lease` liberado;
  - si terminó → `COMPLETED` + conciliación de costo;
  - si el step falla → clasificar error (ADR 0005) → `RETRYING` o `FAILED`.
- Cada step tiene un **presupuesto de tiempo** (p. ej. 90 s); si un solo step no cabe (un embedding de 500 chunks), el step procesa un sub-lote y re-encola.
- **Reanudación**: como cada step es idempotente y el progreso se persiste, un worker muerto a mitad de un step deja el job con el `lease` vencido → otro worker lo retoma desde el inicio de ese step (no desde cero).
- **Cancelación cooperativa**: el worker chequea `estado == CANCELLED` al inicio de cada step.

## Alternativas descartadas

- **Un solo step por job, subir `maxDuration`**: no cubre los casos largos; los vuelve a poner en riesgo de timeout.
- **Streaming de la respuesta del modelo para "avanzar el reloj"**: no ayuda si el total excede el wall-clock; complica el manejo de errores.
- **Worker en un contenedor propio (Fly/Railway/Render)**: infra nueva, contra el brief. Reconsiderar solo si los steps resultan demasiado difíciles de acotar.

## Consecuencias

- Más código de orquestación (una tabla de steps o un `step_actual` + switch en el handler).
- Los handlers de dominio (9 Edge Functions) se refactorizan a funciones de step puras: `(input, ctx) => { progreso, result_parcial, usage }`.
- Métrica a vigilar: nº de steps por job y overhead de re-encolado (target < 2 s entre steps con pg_cron a 10 s → aceptable para batch; jobs interactivos usan Database Webhook).
