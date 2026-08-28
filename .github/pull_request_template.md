## Qué cambia

<!-- Resumen breve. Enlaza el incremento del plan si aplica (docs/p2/03-plan-incremental.md). -->

## Cómo probarlo

<!-- Pasos concretos. Comandos de test relevantes. -->

## Checklist

- [ ] `npm run check` (typecheck + lint + lint:migrations) pasa
- [ ] Tests nuevos/actualizados para el cambio
- [ ] Migraciones **aditivas** o marcadas `-- safe:` / `-- expand-contract:` (ADR 0009 / G7)
- [ ] Cambios de alto impacto detrás de un **feature flag** (ADR 0008)
- [ ] No se debilitan controles de seguridad de P0/P1
- [ ] Plan de **rollback** claro (flag / revert / redeploy / down migration)
- [ ] Si toca costo/latencia de IA: estimación y límites documentados

## Rollback

<!-- Cómo revertir este cambio si algo sale mal en producción. -->
