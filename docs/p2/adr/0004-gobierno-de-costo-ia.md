# ADR 0004 — Gobierno y reserva de costo de IA

**Estado:** Propuesto · **Fecha:** 2026-08-26 · **Contexto de:** P2.2

## Contexto

Hoy `check_ai_budget` es un tope diario global de tokens por org, verificado antes y contabilizado después con `registrar_uso_ia`. No hay reserva, conciliación, cuota mensual, límite por operación, concurrencia, allowlist de modelos, ni política económico/avanzado. Los reintentos son facturables sin control.

## Decisión

**Modelo reserva → ejecución → conciliación con un ledger append-only, en Postgres.**

- **`ai_org_policy`** (1 fila/org, defaults vía función): `cuota_mensual_usd`, `limite_diario_usd`, `limite_por_operacion_usd`, `max_concurrent_jobs`, `modelos_permitidos text[]`, `politica_modelo`, `alertas_umbral_pct int[]`, `max_reintentos_facturables`.
- **`ai_budget_ledger`** (append-only): filas `RESERVADO` / `CONSUMIDO` / `LIBERADO` con `monto_usd`, tokens, modelo, `job_id`. Presupuesto disponible = `cuota - sum(RESERVADO) - sum(CONSUMIDO)` en la ventana.
- **RPC `reservar_presupuesto_ia(tipo, estimado_usd)`** `SECURITY DEFINER`: valida contra política (mensual, diario, por operación, concurrencia), inserta `RESERVADO`, devuelve `reserva_id` — o falla con motivo. Se llama en `POST /api/jobs` antes de dejar el job en `AUTHORIZED`.
- **RPC `conciliar_presupuesto_ia(reserva_id, tokens_in, tokens_out, modelo)`**: cierra la reserva a `CONSUMIDO` con el costo real (tabla de precios por modelo en `ai_model_pricing`), libera el delta. Se llama por el worker al terminar el step que llamó al modelo.
- **RPC `liberar_reserva_ia(reserva_id)`**: en fallo no facturable.
- **Estimación** (`lib/ai-estimate`): `tokens ≈ f(bytes_input, tipo)` con factores calibrados; costo = tokens × precio del modelo elegido por política.
- **Política de modelo**: extracción/clasificación/OCR → modelo económico; análisis/propuesta → económico primero, escalar a avanzado solo si `nivel_confianza` esperado bajo o el usuario lo pide explícitamente (flag por operación). `modelos_permitidos` es un allowlist duro.
- **Reintentos facturables**: el ledger cuenta cuántas llamadas produjeron tokens para un `job_id`; pasado `max_reintentos_facturables` el job va a `FAILED` aunque el error fuera reintentable.

## Alternativas descartadas

- **Solo contabilizar después (como hoy)**: no evita el gasto de un job que ya sabíamos que rebasaría; no permite "presupuesto agotado" como estado limpio del job.
- **Reserva en Redis/Upstash**: infra nueva; el ledger en Postgres es transaccional con el job.
- **Confiar en el `usage` del proveedor como única verdad**: llega tarde y no siempre (streaming, errores parciales); se usa para conciliar, no para autorizar.

## Consecuencias

- `ai_model_pricing` hay que mantenerla al día a mano (o vía un job que lea una fuente) cuando cambien precios.
- La estimación será imperfecta al principio; se calibra con `estimado` vs `real` del ledger (métrica de error de estimación en el dashboard).
- El `AI_DAILY_TOKEN_CAP` global de P0.6 se mantiene como red de seguridad de último recurso.
