# Refactor incremental del frontend (P1.5)

El brief pide separar en los componentes grandes de la licitación:
presentación · estado · consultas · mutaciones · Realtime · upload ·
procesamiento · errores · diálogos · formularios — **gradualmente**, sin
regresiones. Este documento registra lo hecho y lo que queda.

## Hecho en esta fase

### `useRealtimeLista` — estado + consultas + Realtime fuera del componente

`src/hooks/use-realtime-lista.ts`. El patrón que `documentos-tab` y
`analisis-ia-tab` (y otros) repetían a mano:

1. cargar una lista filtrada por `licitacion_id`,
2. abrir un canal `postgres_changes` con el mismo filtro,
3. reducir `INSERT`/`UPDATE`/`DELETE` sobre el estado,
4. `removeChannel` al desmontar — **fácil de olvidar**.

Ahora ocurre una sola vez. El hook acepta `mapear` (proyección fila→item),
`incluir` (filtro, p. ej. `procesado === true`), `alCambiar` (efecto
lateral como un toast) e `inicial` (datos del SSR para no parpadear).
Devuelve `{ items, setItems, recargar, cargando, error }` — `setItems`
sigue disponible para las mutaciones optimistas del componente.

Migrados:
- **`documentos-tab.tsx`** — se eliminaron ~55 líneas del efecto Realtime hecho a mano.
- **`analisis-ia-tab.tsx`** — ídem, ~45 líneas.

### Dependencias de efectos estabilizadas

Se quitaron los `// eslint-disable-next-line react-hooks/exhaustive-deps`
de los componentes del alcance envolviendo la función `cargar()` en
`useCallback([licitacionId])` y listándola como dependencia real del
efecto/callback, en vez de silenciar la regla:

- `documentos-corporativos-card.tsx` (3 disables → 0)
- `seguimiento-tab.tsx` (1 → 0)
- `auditoria-tab.tsx` (1 → 0)
- `propuesta-tecnica-tab.tsx` (1 de `cargar` → 0; el segundo, el de
  sincronización editor↔sección, se conserva **con** un comentario claro:
  excluir `secciones` de las deps es intencional — si no, el editor
  re-setea su contenido en cada tecleo y mueve el cursor).

## Deliberadamente NO hecho (y por qué)

- **Split presentación/contenedor completo de los 8 componentes.** El
  brief dice "gradualmente… conserva comportamiento… evita regresiones".
  Una reescritura de los 8 (360–850 líneas c/u, con estado, Realtime,
  upload y diálogos) sin poder correr la suite e2e completa en este
  entorno (falta el edge runtime local) es alto riesgo de regresión
  silenciosa. Las fixtures de P1.3 (`tests/helpers/fixtures.mjs`) y la
  expansión de la suite e2e son el prerrequisito; se hace como su propia
  fase con revisión por componente.
- **`react-hooks/incompatible-library` en `licitaciones-table` /
  `licitacion-form`** — es una limitación conocida del React Compiler con
  `useReactTable` de TanStack, no un bug del código. Sin acción.
- **Disables de `exhaustive-deps` fuera de los 8 componentes** (jerarquia,
  partidas, requisitos-tecnicos, liberacion, empresa-perfil-form) — mismo
  patrón `cargar`, fuera del alcance nominal de P1.5. Bajo riesgo (la
  función siempre hace el mismo fetch); se limpian en el pase de split.
- **Sweep de accesibilidad** (labels, focus management, navegación por
  teclado en los diálogos) — los `<h1>` faltantes en `/login` y
  `/register` ya se arreglaron en P2·J; el resto (roles ARIA en las
  tablas, orden de foco en los diálogos de firma/subida) es su propio
  pase con auditoría de lector de pantalla (pendiente C4 en
  `docs/p2/16-pendientes.md`).

## Verificación

`typecheck`, `lint` (2 warnings baseline de React Compiler), `build`, 13
suites unitarias, cobertura 97.8 % / 83.8 % — verde. Sin cambios de API ni
de comportamiento observable; la migración a `useRealtimeLista` preserva
el toast "terminó de procesarse" y el refetch al volver a la pestaña.
