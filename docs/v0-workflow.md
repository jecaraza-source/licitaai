# Flujo de trabajo con v0 (UI/UX) + agente de código (backend)

Este proyecto ya está listo para usarse con [v0](https://v0.dev) sin
configuración adicional: `components.json` ya define el estilo shadcn
("base-nova"), los alias (`@/components`, `@/lib`, `@/hooks`, etc.) y el
theming con variables CSS (Tailwind v4) — v0 los detecta automáticamente
al conectar el repo.

## División de responsabilidades

Desde el split de `docs/refactor-frontend.md` (fase P1.6), cada pantalla
compleja está partida en dos archivos:

- **`src/components/**` y `src/app/**/page.tsx`** — presentación pura
  (JSX, clases de Tailwind, estructura visual). Esto es lo que v0 debe
  tocar.
- **`src/hooks/use-<componente>.ts`**, **`src/app/api/**`,
  **`src/lib/**`, **`supabase/**`** — estado, `fetch`/Supabase,
  mutaciones, Realtime, validaciones. Esto lo sigue escribiendo el
  agente de código (Claude); v0 no debería necesitar tocarlo.

Cuando le pidas a v0 que rediseñe una pantalla, si el archivo que abre
es un componente de presentación (`*-tab.tsx`, `*-card.tsx`), puede
reescribir el JSX libremente: el hook con la lógica vive aparte y no se
ve afectado. Si v0 insiste en necesitar un dato o una acción que el hook
actual no expone, la señal correcta es pedirle al agente de código que
amplíe el hook (nuevo campo en el objeto que retorna), no que v0 agregue
su propio `fetch`.

## Conectar v0 a este repositorio

1. Entra a v0.dev con la misma cuenta/equipo de Vercel que ya usa este
   proyecto (`jecaraza-6906s-projects`) — así v0 reutiliza la integración
   de GitHub que ya existe.
2. Crea un proyecto nuevo en v0 e importa el código existente ("Add to
   codebase" / "Import from GitHub" — el nombre exacto puede variar según
   la versión de la UI de v0) y selecciona `jecaraza-source/licitaai`.
3. **Importante:** al conectar, elige o crea una rama dedicada para v0
   (sugerido: `ui/v0`) en vez de dejar que apunte a `main` o `staging`.
   Esto evita que los cambios de v0 se mezclen directo con el trabajo de
   backend sin pasar por revisión.
4. Verifica que v0 detectó el framework (Next.js App Router) y el
   `components.json` — debería mostrar los componentes existentes de
   `src/components/ui` como su librería base, no proponer instalar
   shadcn de nuevo.
5. Cuando aceptes un cambio en v0, usa su función de "Push to GitHub" /
   "Create PR" apuntando a `ui/v0` (o a una rama que luego se mergee ahí).

## Flujo de ramas

- **v0** trabaja sobre `ui/v0` (o ramas cortas que se mergean seguido a
  `ui/v0`).
- **El agente de código** sigue abriendo ramas de feature/fix desde
  `main` como hasta ahora.
- Cada lado abre PR normal hacia `main`/`staging` — sin push directo a
  ninguna de las dos por ninguno de los dos lados.
- Si `ui/v0` empieza a quedarse atrás (el backend agregó un endpoint o
  cambió un tipo que un componente usa), traer `main` a `ui/v0` con un
  merge normal antes de seguir — no hace falta esperar a que v0 "termine"
  para sincronizar.

## Qué pasa si v0 edita un hook por error

No se rompe nada de forma silenciosa: los hooks tienen sus propios tipos
y `npm run check` (typecheck + lint + hygiene + migraciones) falla si la
forma de los datos cambia de forma incompatible con el componente. Aun
así, si ves que v0 tocó un archivo bajo `src/hooks/`, `src/app/api/` o
`src/lib/` en un diff, es una señal de que se salió de su carril — pídele
que deshaga esa parte y avísale al agente de código para que haga el
cambio de datos correspondiente.
