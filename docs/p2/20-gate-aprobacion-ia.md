# Gate de aprobación humana de resultados de IA (P2 · B5 / D5)

## La decisión (2026-08-28)

El brief pide que "la IA nunca declare cumplimiento de forma automática".
Se evaluaron dos enfoques:

| Enfoque | Descartado / elegido |
|---|---|
| Gatear **cada** acción (marcar un requisito, generar el paquete, liberar) contra el `ai_results` que la respalda | ❌ demasiada fricción → la gente apaga el flag → se pierde la protección. Además la IA **no** marca esos checkboxes hoy; los marca un humano |
| **Un** gate, en el único punto **irreversible**: el paso a `ENVIADA` | ✅ elegido |

## Cómo funciona

- **Dónde**: `POST /api/licitaciones/[id]/estado` con `estado_licitacion = "ENVIADA"`, después del gate de liberación existente (rojos / amarillos críticos / checklist de liberación / autorización del supervisor).
- **Qué bloquea**: que exista alguna versión **activa** de `ai_results` de esa licitación en `estado_aprobacion = 'PENDIENTE'`. "Activa" = la más reciente por `(tipo_analisis, documento_id)` — una corrección (D3) es una fila nueva, así que la más reciente es la vigente.
- **Qué desbloquea**: `APROBADO` **y** `RECHAZADO`. Si un humano vio el análisis y decidió no usarlo, también es una decisión válida. Solo `PENDIENTE` (nadie lo miró) bloquea.
- **Respuesta**: `409 CONFLICT` con `error.details.analisisIaSinRevisar` (lista de `{id, tipo_analisis, documento_id, created_at}`).
- **Override**: solo **ADMIN**, mandando `omitir_revision_ia: true`. Queda registrado en la bitácora inmutable (`audit_log`, acción `licitacion_enviada_ia_sin_revisar`) con el usuario y qué análisis se omitieron. Para el caso legítimo donde la revisión se hizo fuera del sistema.
- **Roles**: aplica a todos; solo ADMIN puede omitir.

## Activación

Flag `ai.gate_aprobacion` (OFF por defecto), por organización. Independiente de `ai.versionado_resultados` para poder activarlo por separado.

Mientras el flag esté OFF: cero cambio de comportamiento. El aviso suave `<AvisoRevisionIA>` sigue en todas partes como estaba.

## Dónde se ve

La pestaña **Liberación** (`liberacion-tab.tsx`) muestra, cuando el flag está activo, "N análisis de IA sin revisar" en el resumen del gate, con el detalle de qué tipos y un recordatorio de revisarlos en la pestaña Análisis IA (que usa el endpoint de revisión de D3 + el diff de B6).

## Qué NO se hizo (a propósito)

- Gatear `checklist_item.cumple = true` / `requisito_tecnico` individualmente.
- Gatear los generadores de `.docx` (son borradores para revisar).
- Enforcement en RLS (necesita un mensaje útil y el override logueado; `apiRoute` es el lugar).
