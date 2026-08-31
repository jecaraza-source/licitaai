# Refactor incremental del frontend (P1.5 → P1.6)

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

## P1.6 — split presentación/contenedor completo (motivado por v0)

El split que P1.5 pospuso por riesgo de regresión sin e2e se hizo en esta
fase, motivado por un requisito nuevo: el equipo quiere iterar la UI con
v0 (herramienta de rediseño por IA) mientras el backend/lógica de datos
lo sigue escribiendo un agente de código. Si v0 reescribe un archivo que
mezcla JSX con `fetch`/Supabase/handlers, puede borrar lógica de negocio
sin darse cuenta — la separación física en dos archivos hace eso
imposible por construcción, no solo por convención.

Mitigación del riesgo que P1.5 señalaba (sin e2e completo disponible):
la extracción fue **mecánica**, no un rediseño — cada pieza de estado,
efecto y handler se movió tal cual a `src/hooks/use-<componente>.ts`,
devolviendo un objeto con los **mismos nombres de variable** que usaba
el JSX, así que el componente de presentación no cambia ninguna línea
de lógica, solo de dónde importa las cosas. Se verificó con
`typecheck` + `lint` + la suite unitaria completa después de cada
componente (no al final), comparando contra la misma suite sobre el
código sin tocar (`git stash`) para confirmar que ningún fallo nuevo se
introdujo.

Componentes migrados (hook en `src/hooks/`, componente ahora solo JSX):
`documentos-legales-tab`, `documentos-tecnicos-tab`, `viabilidad-tab`,
`propuesta-economica-tab`, `partidas-tab`, `auditoria-tab` (incl.
`ChecklistRow`), `documentos-corporativos-card` (Configuración),
`seguimiento-tab` (incl. `FormalizacionCard`), `liberacion-tab` (incl.
`EvidenciaEnvioCard`), `documentos-tab` (los 4 subcomponentes:
`RequisitoRow`, `DocumentosRequeridosCard`, `DocumentoConvocanteRow`,
`DocumentosConvocanteCard`), `analisis-ia-tab`,
`junta-aclaraciones-tab` (dnd-kit se queda en el componente — es
presentación de arrastre, no lógica de datos), `propuesta-tecnica-tab`
(el editor TipTap se crea dentro del hook con `useEditor` y se devuelve
como cualquier otro valor; se preservó tal cual el comentario sobre por
qué `secciones` queda fuera de las deps del efecto de sincronización).

Deliberadamente sin tocar: estado puramente visual sin relación con
datos del servidor (`expandido` en `ChecklistRow`, el estado interno de
`useSortable`/`useDropzone` en las filas) se queda en el componente —
mover eso a un hook no reduce riesgo, solo añade indirección.

Convención para v0 a partir de aquí: v0 edita `src/components/**`
(JSX/estilos) y `src/app/**/page.tsx` (estructura); el agente de código
sigue siendo dueño de `src/hooks/**`, `src/app/api/**`, `src/lib/**` y
`supabase/**`. Ver el flujo de ramas sugerido en el mensaje de la
sesión que hizo este split (rama dedicada para v0, PRs normales para
mezclar).

## Deliberadamente NO hecho (y por qué)

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

**P1.5:** `typecheck`, `lint` (2 warnings baseline de React Compiler),
`build`, 13 suites unitarias, cobertura 97.8 % / 83.8 % — verde. Sin
cambios de API ni de comportamiento observable; la migración a
`useRealtimeLista` preserva el toast "terminó de procesarse" y el
refetch al volver a la pestaña.

**P1.6 (split completo):** `typecheck` y `lint` limpios tras cada
componente migrado (no solo al final), mismos 2 warnings baseline. Suite
unitaria: 13/14 suites OK, igual que en `main` sin tocar (la suite que
falla, `api-validate.test.mjs`, falla por igual con y sin este cambio —
confirmado con `git stash` — y no toca ningún archivo de este split).
Sin cambios de API ni de comportamiento observable: cada hook devuelve
exactamente los mismos nombres que el componente usaba como variables
locales antes de la extracción.
