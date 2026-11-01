# Auditoría de navegación y usabilidad — LicitaAI

> **Estado al 2026-10-31.** La fase 1 ya está en `main`: #54 resolvió A1, A2, A5, A6, C1 y C3 y parte de A7, B4 y B6. Lo que faltaba (errores de carga que se tragaban en Partidas, Análisis IA, revisor económico y `/estado`; enlace a Términos en el menú de usuario; aviso de cambios sin guardar al salir de una pestaña, C2) se cierra en el PR de arreglos de navegación. Siguen abiertos solo los puntos de diseño (fase 2) y C4 (móvil sin verificar).

Fecha: 2026-10-08 · Base: `main` en `6774426` (#52)

## Alcance y límites

- Auditoría **de código y de lo que se vio en pantalla** durante las pruebas de la Fase 1 en staging (pestañas Liberación y Propuesta económica, login, dashboard). No cambia nada.
- **No se probó en móvil** ni con lector de pantalla. Lo que se dice de accesibilidad sale de leer el código.
- Cada hallazgo indica si se resuelve **en código** (lo hago yo) o **necesita decisión de diseño** (se decide en la herramienta de diseño y luego se implementa).
- Esfuerzo: S = menos de medio día · M = 1–2 días · L = más de 2 días.

## 1. Mapa de la plataforma

| Zona | Rutas | Cómo se llega |
|---|---|---|
| Autenticación | `/login`, `/register`, `/invitacion/[token]`, `/seleccionar-empresa`, `/terminos` | Redirecciones y enlaces de correo |
| Operación | `/dashboard`, `/licitaciones`, `/licitaciones/nueva`, `/licitaciones/[id]` | Barra lateral |
| Gestión | `/referencias`, `/configuracion` | Barra lateral |
| Administración de plataforma | `/admin/usuarios`, `/admin/salud` | Solo por redirección para cuentas de plataforma; **no hay enlace en la interfaz** |
| Públicas | `/estado`, `/aviso-privacidad`, `/terminos` | Sin enlace desde la app |

**Barra lateral (5 elementos):** Resumen · Licitaciones · Nueva licitación · Referencias · Configuración.

**Ficha de una licitación (`/licitaciones/[id]`): 13 pestañas en 2 niveles**

| Grupo | Pestañas |
|---|---|
| Resumen | Resumen |
| Documentos | Documentos · Documentos Legales · Documentos Técnicos |
| Análisis | Análisis IA · Viabilidad |
| Propuesta | Partidas · Propuesta Técnica · Propuesta Económica |
| Proceso | Auditoría · Liberación · Junta de Aclaraciones · Seguimiento |

## 2. Hallazgos

### Impacto alto

| # | Hallazgo | Evidencia | Se resuelve | Esfuerzo |
|---|---|---|---|---|
| A1 | **La pestaña activa no está en la URL.** Recargar o volver atrás regresa a "Resumen"; no se puede compartir un enlace a "Liberación" ni enlazar desde un mensaje de bloqueo. | `licitacion-tabs-nav.tsx`: `useState("resumen")` | Código | M |
| A2 | **Los filtros, la búsqueda y la página de la lista tampoco están en la URL.** Abrir una licitación y volver pierde el filtro. No se puede enlazar a "las enviadas". | `licitaciones-table.tsx:79-86`: `useState` | Código | M |
| A3 | **La ficha no dice qué sigue ni qué bloquea.** Resumen es una pila de 6 tarjetas. El estado de la compuerta (rojos, pendientes, revisor, autorización) solo se ve dentro de Liberación; la cuenta regresiva a la fecha de entrega solo existe en el dashboard. | `licitaciones/[id]/page.tsx` | Diseño + código | M–L |
| A4 | **El dashboard no es accionable.** Las 4 tarjetas de KPI y la gráfica por estado no son enlaces. "Próximas a vencer" da un número pero no cuáles son. "Recientes" ordena por creación, no por urgencia. | `dashboard-content.tsx` | Diseño + código | M |
| A5 | **Los mensajes de bloqueo mandan a otra pestaña sin enlace.** "Asígnalo en la pestaña Propuesta económica", "Revisa las pestañas Auditoría y Liberación". | `liberacion-tab.tsx`, `estado-selector.tsx` | Código (depende de A1) | S |
| A6 | **La barra lateral no marca nada como activo dentro de una licitación.** "Licitaciones" solo se activa con `pathname === "/licitaciones"`; en `/licitaciones/[id]` ningún elemento se ilumina. | `app-sidebar.tsx` (`isActive`) | Código | S |
| A7 | **Los errores de carga se tragan.** Hay 5 `fetch(...).catch(() => {})` en componentes; si falla la llamada el usuario ve el esqueleto para siempre, sin mensaje ni botón de reintentar. | `dashboard-content.tsx` y otros | Código | S–M |

### Impacto medio

| # | Hallazgo | Evidencia | Se resuelve | Esfuerzo |
|---|---|---|---|---|
| B1 | **Las pestañas no siguen el orden del trabajo.** "Proceso" mezcla pasos de antes de enviar (Auditoría, Liberación), un paso temprano (Junta de aclaraciones) y uno posterior al envío (Seguimiento). "Partidas" se ubica en "Propuesta" aunque nace del análisis de las bases. | `licitacion-tabs-nav.tsx` (`GRUPOS`) | Diseño | M |
| B2 | **Nombres repetidos o ambiguos.** "Resumen" (menú) abre una página titulada "Dashboard"; "Resumen" es además la primera pestaña. "Proceso" es un grupo de pestañas y también el título de la línea de tiempo de fechas. Hay tres pestañas "Documentos…" y otros documentos en Configuración. | `app-sidebar.tsx`, `dashboard/page.tsx`, `page.tsx` de la ficha | Diseño (vocabulario) | S |
| B3 | **El selector de estado permite saltar a cualquier estado.** No hay un "Avanzar a…" ni se muestran los requisitos antes de elegir ENVIADA; el bloqueo aparece después, como un aviso. | `estado-selector.tsx` | Diseño + código | M |
| B4 | **El menú de usuario solo tiene "Cerrar sesión".** No enlaza a Configuración, Referencias, Términos, Aviso de privacidad ni Soporte. No hay selector visible de empresa activa (el encabezado muestra el nombre como texto). | `user-menu.tsx`, `header.tsx` | Código (+ decisión sobre el selector de empresa) | S |
| B5 | **Marca repetida que ocupa espacio.** Logo grande arriba de la barra lateral (`h-40`, 160 px) y otro abajo (`h-42`), más una barra con logo en todas las páginas (#47) y el logo del encabezado en móvil. Los elementos de menú quedan lejos del borde superior. | `app-sidebar.tsx`, `footer.tsx`, `layout.tsx` | Diseño + código | S |
| B6 | **Encabezados de página inconsistentes.** Licitaciones, Configuración, Referencias y Nueva licitación llevan etiqueta ("Operación" / "Gestión") y recuadro de icono; el Dashboard y la ficha no. | los `page.tsx` | Código | S |
| B7 | **El alta de licitación es un formulario largo.** 8 campos principales y 11 fechas opcionales en una sola pantalla; al guardar aterriza en Resumen sin una indicación del siguiente paso. | `licitacion-form.tsx` | Diseño + código | M |
| B8 | **Configuración mezcla temas.** "Perfil de la empresa" incluye "Métricas de valor" junto al perfil. Los documentos corporativos, que alimentan las auditorías, son una tarjeta de media pantalla al fondo, y se confunden con la pestaña "Documentos Legales" de cada licitación. | `configuracion/page.tsx`, `configuracion-empresa.tsx` | Diseño | M |

### Accesibilidad y robustez

| # | Hallazgo | Evidencia | Se resuelve | Esfuerzo |
|---|---|---|---|---|
| C1 | **Las pestañas son botones sin semántica de pestañas.** No hay `role="tab"`, `aria-selected` ni `aria-controls`, ni navegación con flechas. El estado activo se indica solo con color y una animación de escala. | `licitacion-tabs-nav.tsx` (sin coincidencias ARIA) | Código | S–M |
| C2 | **Al cambiar de pestaña el panel se desmonta** (el propio código lo documenta: solo se monta la pestaña activa). Ediciones sin guardar, por ejemplo precios en Propuesta económica, se perderían sin aviso. **No lo probé en pantalla.** | `licitaciones/[id]/page.tsx` (comentario F3) | Código (mantener montado o avisar) | S–M |
| C3 | **Sin migas de pan.** Solo un enlace "Volver a licitaciones" en la ficha. | `licitaciones/[id]/page.tsx` | Diseño + código | S |
| C4 | **Móvil sin verificar.** La ficha tiene una barra de 5 grupos más una segunda de pestañas con scroll horizontal. | — | Probar | S |

### Qué conviene conservar
- Barra lateral con grupos "Operación" y "Gestión", que ya es clara y corta.
- La línea de tiempo con la "siguiente etapa" resaltada.
- Esqueletos de carga, insignias de estado y estilo de tarjetas, que son consistentes.
- Ocultar "Nueva licitación" a quien tiene rol VIEWER.
- El agrupamiento en dos niveles como idea: resolvió un scroll horizontal de 13 pestañas.

## 3. Flujos clave y dónde duelen

**Crear → preparar → enviar** (el flujo principal)
1. *Crear:* formulario largo (B7). Aterriza en Resumen sin guía.
2. *Preparar:* hay que saber que los documentos se suben en "Documentos", se analizan en "Análisis IA", se revisan requisitos en "Partidas"/"Documentos Legales". No hay un hilo que lo conecte (A3, B1).
3. *Enviar:* la compuerta está en "Liberación", escondida en "Proceso". Cuando bloquea, el mensaje no enlaza (A5) y el estado vuelve a Resumen al recargar (A1).

**Volver a una licitación desde la lista:** pierde filtro y página (A2).

**Enterarse de qué vence:** solo en el dashboard, sin enlace a lo vencido (A4).

## 4. Propuesta de estructura (para decidir en diseño)

**Barra lateral:** conservar los 5 elementos. Renombrar "Resumen" a "Inicio" (B2). Evaluar una entrada propia "Documentos de la empresa" (B8).

**Ficha de licitación, dos opciones:**

- **Opción A (conservadora):** mantener los dos niveles, **con la pestaña en la URL**, insignias de pendientes en cada grupo (por ejemplo, "Liberación · 11") y un panel fijo "Siguiente paso" sobre las pestañas.
- **Opción B (por fases):** un avance por fases visible, *Preparar → Proponer → Revisar y enviar → Seguimiento*, con la Junta de aclaraciones en "Preparar" y las insignias de pendientes por fase. Es más guiada y cambia más el modelo mental.

En ambas, el panel "Siguiente paso" resume: fecha de entrega con cuenta regresiva, rojos y amarillos críticos, puntos de liberación pendientes, revisión independiente y autorización del supervisor. Cada línea es un enlace a su pestaña.

## 5. Plan sugerido

| Fase | Contenido | Tipo | Notas |
|---|---|---|---|
| 1. Arreglos rápidos | A1, A2, A5, A6, A7, B4, B6, C1, C2, C3 | Código, sin diseño | Un PR. A1 es la base de A5 y del panel de la fase 2 |
| 2. Diseño | A3, A4, B1, B2, B3, B5, B7, B8 | Herramienta de diseño | Brief abajo |
| 3. Implementación | Lo que salga del diseño | Código | Por PRs pequeños, una pantalla a la vez |

## 6. Brief para la herramienta de diseño

- **Producto:** plataforma de gestión de licitaciones públicas en México, en español, importes en MXN.
- **Usuarios y roles:** ADMIN, MANAGER, ANALYST (escriben) y VIEWER (solo lectura). Equipos pequeños donde una misma persona suele cubrir varias funciones.
- **Tarea principal:** llevar una licitación desde el registro hasta el envío en Compras MX sin que nada quede sin revisar, y no perder fechas.
- **Qué rediseñar:** (1) la ficha de licitación con su navegación y el panel "Siguiente paso", (2) el dashboard accionable, (3) el alta de licitación en pasos.
- **Qué no cambiar:** la barra lateral, los colores de empresa que cambian por organización, los componentes base (shadcn).
- **Restricciones técnicas:** Next 16, Base UI, tema por empresa; las 13 pestañas actuales y sus contenidos se conservan, solo se reorganizan.
- **Criterios de éxito:** llegar a "Liberación" en un clic desde un aviso; saber en menos de 5 segundos qué falta para enviar; recargar sin perder el lugar.

## 7. Pendiente de verificar

- Comportamiento en móvil y en tablet (C4).
- Si ediciones sin guardar se pierden al cambiar de pestaña (C2).
- Cómo cambia el usuario la empresa activa cuando hay varias (B4): no encontré un control fuera del flujo `/seleccionar-empresa` y del formulario de Configuración.
