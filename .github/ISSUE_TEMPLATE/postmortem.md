---
name: Postmortem
about: Análisis sin culpables de un incidente SEV1/SEV2 (P2 · Fase I)
title: "Postmortem: <resumen>"
labels: postmortem
---

> Sin culpables: analizamos los factores sistémicos y qué cambiar, no a las
> personas. Todos actuaron con la información y las herramientas que tenían.

## Resumen

- **Incidente:** #<n>
- **Severidad:** SEVx
- **Duración:** <inicio real> → <recuperación> (<X> min)
- **Impacto:** <organizaciones / requests / jobs afectados; datos si aplica>

## Qué pasó

<!-- Narrativa breve y factual. -->

## Cronología

| Hora (UTC) | Evento |
|---|---|
| | detección (¿cómo? alerta / usuario / casualidad) |
| | mitigación |
| | recuperación confirmada |

## Causa raíz

<!-- El factor sistémico, no "fulano hizo X". P. ej.: "una migración
cambió una política RLS y no había un test de aislamiento que lo cubriera". -->

## Qué funcionó bien

<!-- Detección rápida, un runbook útil, un flag que permitió cortar sin deploy, … -->

## Qué no funcionó / factores contribuyentes

## Acciones de mejora

| Acción | Dueño | Fecha objetivo | Issue |
|---|---|---|---|
| | | | |

<!-- Priorizar las que reducen la probabilidad o el tiempo de detección/mitigación. -->
