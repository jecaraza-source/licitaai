# Seguridad web (P1.6)

Continúa el endurecimiento de P0 (multi-tenant, e.firma, prompt injection) a nivel de la capa web.

## Cabeceras (`next.config.ts`)

| Cabecera | Valor | Nota |
|---|---|---|
| `Content-Security-Policy` | ver abajo | `unsafe-eval` **solo en desarrollo** (HMR de Turbopack); en producción se quita. `object-src 'none'`, `upgrade-insecure-requests` en prod |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | **nuevo** en P1.6. Sin efecto sobre `http://localhost`, seguro de emitir siempre |
| `X-Frame-Options` / `frame-ancestors 'none'` | `DENY` | anti-clickjacking (ya existía) |
| `X-Content-Type-Options` | `nosniff` | ya existía |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | ya existía |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | ya existía |

CSP actual:

```
default-src 'self';
script-src 'self' 'unsafe-inline' ['unsafe-eval' solo en dev];
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: <origen Supabase>;
font-src 'self' data:;
connect-src 'self' <origen Supabase> <ws Supabase> https://*.ingest.sentry.io https://*.ingest.us.sentry.io;
frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none';
[upgrade-insecure-requests solo en prod]
```

**Pendiente** (siguiente paso, no bloqueante): reemplazar `script-src 'unsafe-inline'` por nonces. Requiere un middleware que lea el nonce que Next inyecta y lo propague a la CSP por request. `style-src 'unsafe-inline'` lo necesita Tailwind/shadcn en runtime.

## Inyección de CSS por colores de marca

`buildCompanyThemeStyle()` interpola `empresa_perfil.color_primario` / `color_secundario` en un bloque `<style>` del layout del panel. Antes solo se validaban como `string` de ≤20 caracteres — un valor como `#fff}@import url('//evil')...` era inyección de CSS que afectaba a **toda la organización** (deface, exfiltración vía selectores de atributo + `background: url()`).

Corregido en dos capas:
- **Al guardar**: el schema Zod (`src/lib/validations/empresa-perfil.ts`) exige `^#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?$`.
- **Al renderizar**: `esHexValido()` en `buildCompanyThemeStyle()` descarta cualquier color que no sea hex estricto (defensa en profundidad para filas anteriores a la restricción).

Tests: `tests/unit/theme-colors.test.mjs`.

## Saneado de HTML generado por IA

`src/lib/sanitize-html.ts` — saneador por allowlist (sin dependencia externa; DOMPurify necesita un DOM). Conserva ~24 etiquetas de formato, **elimina todos los atributos** (salvo `colspan`/`rowspan` acotados a entero en celdas), descarta `<script>`/`<style>`/`<iframe>`/… con su contenido, comentarios, y cualquier etiqueta fuera de la lista (conservando el texto).

Aplicado en:
- `POST /api/licitaciones/[id]/propuesta-tecnica/mejorar` — sobre la salida del modelo antes de devolverla.
- `PUT /api/licitaciones/[id]/propuesta-tecnica` — sobre cualquier campo `html` de `contenido_json` antes de persistir (cubre también el contenido que originó la Edge Function `generar-propuesta-tecnica`, que se guarda por esta ruta al editarse).

Defensa previa que se mantiene (P0.6-D): TipTap/ProseMirror descarta al parsear lo que no encaja en su schema (sin extensión `Link`, sin `<script>`), y `html-to-docx.ts` es un parser de allowlist construido sobre el modelo de objetos de `docx.js` (nunca `innerHTML`).

Tests: `tests/unit/sanitize-html.test.mjs` (11 casos).

**Pendiente**: replicar `sanitizarHtml` en la Edge Function `generar-propuesta-tecnica` (Deno) para sanear en el punto de generación además de en el de guardado.

## CSRF

Postura actual (sin cambios de código, se documenta):
- Auth por cookie de Supabase con `SameSite=Lax` (default de `@supabase/ssr`) — un `POST` cross-site desde otro origen no lleva la cookie.
- Todas las rutas que mutan son `POST`/`PUT`/`PATCH`/`DELETE` con `Content-Type: application/json`; un formulario HTML cross-site no puede fijar ese content-type sin un preflight CORS, que esta app no habilita para orígenes externos.
- `form-action 'self'` en la CSP.

**Pendiente** (endurecimiento, no bloqueante): verificación explícita del header `Origin`/`Sec-Fetch-Site` en `apiRoute()` para las mutaciones, como defensa adicional si en el futuro se añade auth por header o CORS.

## Otros

- **Stack traces**: `apiRoute()` nunca devuelve el mensaje crudo de un error no controlado (P1.1) — se registra server-side con el `request_id` y el cliente recibe `INTERNAL_ERROR` genérico.
- **Signed URLs**: las exportaciones (`H4`) usan URLs firmadas de 72 h sobre un bucket privado; los documentos originales se sirven por RLS de Storage.
- **Redirects**: el middleware solo redirige a rutas internas fijas (`/login`, `/seleccionar-empresa`, `/terminos`, `/dashboard`) — no hay redirect basado en un parámetro del request.
