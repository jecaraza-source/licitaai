---
name: Incidente
about: Registro de un incidente de producción (P2 · Fase I)
title: "[SEVx] <resumen del impacto>"
labels: incidente
---

## Resumen

<!-- Qué está pasando, en una frase. -->

- **Severidad:** SEV1 / SEV2 / SEV3 (ver docs/p2/10-slo-y-alertas.md §2)
- **Inicio (detectado):** <fecha/hora UTC>
- **Inicio (real, si se conoce):** <fecha/hora UTC>
- **Impacto:** <qué usuarios / organizaciones / funcionalidad>
- **Runbook aplicado:** <enlace a docs/p2/runbooks/…>

## Cronología

<!-- Actualizar cada 30 min en SEV1. Hora UTC + qué se hizo/observó. -->

- `HH:MM` —
- `HH:MM` —

## Mitigación aplicada

<!-- Qué se hizo para detener el daño (flag bajado, rollback, cancelación de jobs, …). -->

## Estado

- [ ] Contenido (el daño no crece)
- [ ] Mitigado (usuarios sin impacto)
- [ ] Causa raíz identificada
- [ ] Fix permanente desplegado
- [ ] Postmortem (SEV1/SEV2, dentro de 5 días hábiles)
