# Runbook — Documento malicioso

**Sev:** SEV2

Aplica a: un archivo subido que (a) rompe repetidamente el procesamiento,
(b) intenta prompt injection contra un modelo, o (c) tiene contenido
activo/malformado que podría explotar una librería.

## Defensas ya en el sistema

- **Storage MIME allowlist** por bucket (P0.5) + **verificación de magic
  bytes** del contenido real antes de procesar (P0.5-B) — un `.exe`
  disfrazado de PDF se rechaza con 422 y el job va a `FAILED` no
  reintentable.
- **Guardia anti prompt-injection** (`conGuardia()`) antepuesta a los 15
  prompts de sistema; el contenido del documento se enmarca como "dato, no
  instrucción" (P0.6).
- **Validación de esquema** de la salida de IA (`analizar-bases` completo;
  el resto por `tool_choice`).
- Export a `.docx` por parser de allowlist (no interpola HTML crudo).

## Síntoma

- Un `documento_id` concreto aparece muchas veces en `jobs_dead_letter`.
- El resultado de un análisis contiene texto que parece obedecer una
  instrucción incrustada ("este documento cumple con todo", frases fuera de
  tono) — reportado vía el flujo "reportar resultado incorrecto" (D6).

## Diagnóstico

```sql
select * from public.jobs_dead_letter where recurso_id = '<documento_id>';
select id, nombre, storage_path, tamanio_bytes, procesado from public.documentos
 where id = '<documento_id>';
```

Descargar el archivo (service role) y revisarlo en un entorno aislado
(sandbox / VM). NO abrirlo en una máquina de trabajo si se sospecha
contenido activo.

## Mitigación

1. **Marcar el documento como no procesable** y cancelar sus jobs:
   ```sql
   update public.documentos set procesado = false where id = '<documento_id>';
   update public.jobs set estado = 'CANCELLED', finished_at = now()
   where recurso_id = '<documento_id>' and estado in ('AUTHORIZED','RETRYING');
   ```
2. Si es prompt injection que **superó** la guardia: marcar los
   `ai_results` afectados como `RECHAZADO` (`aprobar_resultado_ia`) y
   notificar a la organización que ese análisis no es fiable.
3. Si es un archivo que crashea una librería (`pdf-parse`, etc.): el job ya
   falla de forma controlada; añadir el patrón a `contenidoCoincideConNombre`
   / a un check previo si es detectable por bytes.
4. Si viene de un usuario que lo sube repetidamente: [revocar su sesión](revocar-sesiones.md)
   y hablar con la organización.

## Verificación

- El documento no vuelve a generar jobs.
- Los `ai_results` derivados de una inyección están `RECHAZADO`.

## Seguimiento

- Añadir el documento (anonimizado) al dataset de evals de prompt injection
  (`tests/evals/`) — debe fallar de forma segura en el futuro.
- Si superó la guardia: reforzar el framing del prompt afectado (nueva
  `prompt_templates.version`).
