# ADR 0008 — Feature flags

**Estado:** Propuesto · **Fecha:** 2026-08-26 · **Contexto de:** P2.8 (transversal)

## Decisión

**Flags server-side respaldados por una tabla `feature_flags` + override por variable de entorno, evaluados en `lib/flags.ts`. Sin proveedor externo.**

- **`feature_flags`** (`key text pk, descripcion, enabled bool, rollout_pct smallint, orgs_incluidas uuid[], orgs_excluidas uuid[], updated_at, updated_by`).
- **Resolución** `isEnabled(key, { organizationId })`:
  1. env `FLAG_<KEY>=on|off` gana sobre todo (kill switch de emergencia sin tocar DB).
  2. `orgs_excluidas` → false; `orgs_incluidas` → true.
  3. `rollout_pct` → `hash(key + organizationId) % 100 < rollout_pct` (determinista por org).
  4. default `enabled`.
- **Caché** en memoria del proceso 30 s (evita una query por request).
- **Uso**: `apiRoute()` acepta `flags: ["jobs.async_analizar_bases"]` y responde 404/feature-off si no está activa; el worker consulta flags por tipo de job; los componentes reciben el estado resuelto desde el Server Component.
- **Flags de esta fase**: `jobs.async_<tipo>` (11), `ai.gobierno_costo`, `ai.cache`, `ai.versionado_resultados`, `resiliencia.circuit_breaker`, `perf.virtualizar_tablas`, `retencion.limpieza_automatica`.
- **Higiene**: cada flag tiene un issue de "retirar flag" y una fecha objetivo; los flags permanentes (kill switches) se marcan como tales.

## Alternativas descartadas

- **LaunchDarkly / Vercel Flags SDK con proveedor**: capacidad/infra nueva para algo que una tabla resuelve.
- **Solo variables de entorno**: no permite rollout por org ni cambio sin redeploy.
- **Edge Config de Vercel**: viable y rápido, pero añade otra fuente de verdad fuera de Postgres; la tabla es auditable con `audit_log`.

## Consecuencias

- Un flag mal configurado afecta a todas las orgs → cambios de flag pasan por `audit_log` y, para flags de alto impacto, por PR a un seed.
- La evaluación determinista por `hash(org)` significa que subir `rollout_pct` nunca saca a una org que ya estaba dentro.
