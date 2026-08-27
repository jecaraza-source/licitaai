# ADR 0006 — Versionado y trazabilidad de resultados de IA

**Estado:** Propuesto · **Fecha:** 2026-08-26 · **Contexto de:** P2.3

## Contexto

Hoy los resultados de IA viven en tablas de dominio (`analisis_bases`, `estudio_mercado`, `junta_aclaraciones.respuestas_json`, `seguimiento`) y en varias se **sobrescriben** o se insertan filas sueltas sin marcar la anterior como reemplazada. No se registra hash del documento, versión del prompt, parámetros del modelo, latencia, evidencias usadas, ni estado de aprobación. Los prompts son literales en el código.

## Decisión

**Tabla `ai_results` append-only como registro canónico de toda salida de IA, con `prompt_templates` versionados y `ai_result_citations`.**

- **`ai_results`**: nunca se hace `UPDATE` de `resultado_json`. Una corrección/re-análisis es una fila nueva con `reemplaza_a = <id anterior>`. Campos: org, recurso, `documento_sha256`, `documento_version`, `tipo_analisis`, `prompt_template_id` + `prompt_version`, `provider`, `modelo`, `params_json`, tokens, `costo_usd`, `latencia_ms`, `resultado_json`, `nivel_confianza`, `salida_incompleta`, `estado_aprobacion`, `aprobado_por/at`, `reused_from`, `created_at`.
- Las tablas de dominio conservan una **vista materializada / columna puntero** al `ai_results` activo (el más reciente APROBADO, o el más reciente si ninguno lo está) para no romper las lecturas actuales → **compatibilidad**.
- **`prompt_templates`** (`id, nombre, version, cuerpo, esquema_salida_json, modelo_sugerido, params, activo`): los prompts salen del código a seed versionado. `conGuardia()` se sigue aplicando encima. Cambiar un prompt = nueva `version`, no edición in-place.
- **`ai_result_citations`** (`ai_result_id, document_chunk_id, documento_id, pagina, seccion, extracto, score`): toda afirmación sobre un documento enlaza su evidencia. Los handlers que hoy hacen RAG (`preguntar`, `analizar-fallo`, análisis por documento) ya tienen los chunks a mano; solo falta persistirlos.
- **Detección de salida incompleta**: el handler marca `salida_incompleta = true` si `stop_reason == 'max_tokens'` o si la validación de esquema encontró campos faltantes.
- **Aprobación humana**: acciones críticas (declarar un requisito cumplido, liberar propuesta) exigen `estado_aprobacion = APROBADO`. Hasta entonces la UI rotula "no verificado por una persona".
- **Comparación de versiones**: `GET /api/ai-results/:recurso?compare=v1,v2` → diff estructural.

## Alternativas descartadas

- **Versionar dentro de cada tabla de dominio** (`analisis_bases_v2`, …): duplica el esquema de versionado 5 veces, inconsistente.
- **Event sourcing completo**: sobredimensionado; `ai_results` append-only da el 90 % del valor.
- **Guardar el prompt renderizado completo en cada fila**: se guarda `prompt_template_id + version + params`; el cuerpo vive una vez en `prompt_templates`. (El input del documento no se guarda crudo por privacidad — se guarda su hash.)

## Consecuencias

- Migración de datos: backfill de `ai_results` desde las tablas actuales (una fila por resultado existente, `estado_aprobacion = APROBADO` para no bloquear flujos en curso).
- Las Edge Functions dejan de escribir el resultado final; devuelven el `resultado_json` + `usage` y el worker lo persiste transaccionalmente con la conciliación de costo y las citas.
- `evals/` (ADR 0007) consume `ai_results` + `ai_result_citations` para medir alucinación (afirmación sin cita válida) y requisitos omitidos.
