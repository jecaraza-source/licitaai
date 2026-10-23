# P2 · Entregable 21 — Flujo de datos hacia proveedores de IA

Inventario de qué contenido envía LicitaAI a cada proveedor de IA, por función.
Base para el aviso de privacidad (`src/app/aviso-privacidad/page.tsx`), para
responder a clientes ("¿quién ve mis documentos y mis precios?") y para el
trámite A3 (DPA y retención cero con los proveedores).

Estado: **2026-10-23**, sobre `main` en `c3de02e`. Se obtuvo leyendo el código;
**si una función cambia lo que envía, hay que actualizar esta tabla y el aviso.**

## 1. Proveedores y modelos
| Proveedor | Para qué | Modelo |
|---|---|---|
| **Anthropic** | Lectura de documentos, análisis, auditoría, redacción, respuestas | `claude-sonnet-5` por defecto. La política de modelo por organización (`ai.politica_modelo`) puede cambiarlo, pero está **apagada** |
| **OpenAI** | **Solo embeddings** (índice de búsqueda) | `text-embedding-3-small` |

Llaves: `ANTHROPIC_API_KEY` y `OPENAI_API_KEY` (cuentas de la API; las suscripciones
de chat Pro/Plus no intervienen).

## 2. Qué se envía, por función
"Datos personales" = puede contener datos personales de personas físicas.

| Función | Cuándo corre | Proveedor | Qué se envía | Datos personales |
|---|---|---|---|---|
| `procesar-documento` | Al subir **cualquier PDF** a una licitación | **OpenAI** | **Todo el texto del documento**, troceado, para crear embeddings | Sí, si el PDF los trae (el texto se extrae en local con `pdf-parse`) |
| (ídem, PDF escaneado) | Cuando el PDF casi no tiene texto | **Anthropic** | El **PDF completo** (base64) para extraer el texto | Sí |
| `procesar-referencia-legal` | Al cargar una ley o reglamento | OpenAI | Texto de leyes, troceado | No (texto público) |
| `analizar-bases` | "Analizar bases" | OpenAI + Anthropic | Una consulta fija por sección (a OpenAI) y los **fragmentos de las bases** recuperados (a Anthropic) | Bajo (bases públicas) |
| `preguntar` (chat con documentos) | Al preguntar sobre una licitación | OpenAI + Anthropic | La **pregunta del usuario** (a OpenAI, para buscar) y fragmentos de los documentos + la pregunta (a Anthropic) | Según el documento |
| `referencias-legales/preguntar` | Pregunta sobre leyes | OpenAI + Anthropic | La pregunta; fragmentos de leyes | No |
| **`analizar-documento-corporativo`** | Al subir un documento de la empresa | Anthropic | **El archivo completo** (INE, acta constitutiva, poder notarial, comprobante de domicilio, constancia fiscal, opinión de cumplimiento…) + su tipo | **Sí, alta sensibilidad** (nombre, CURP, domicilio, firma, fotografía) |
| **`auditar-documento`** | "Auditar" un documento del checklist | Anthropic | **El archivo completo** + el requisito, el fundamento, la vigencia, la fecha de entrega y **razón social, RFC y representante legal de la empresa** | Sí |
| **`auditar-expediente`** | "Auditar expediente" | Anthropic | Checklist con el resultado de cada auditoría (RFC, razón social, representante legal, fechas detectadas), **las partidas económicas con precios** y el RFC y la razón social de la empresa. No envía los archivos | Sí, y **precios ofertados** |
| `generar-propuesta-tecnica` | "Generar propuesta técnica" | Anthropic | Datos de la licitación, análisis de bases, respuestas de la junta y el **perfil de la empresa** (razón social, RFC, giro, años de experiencia, certificaciones, clientes de referencia) | Sí (nombres de clientes de referencia) |
| `propuesta-tecnica/mejorar` | "Mejorar con IA" una sección | Anthropic | El HTML de la sección escrita | Según el texto |
| `generar-preguntas-junta` | Junta de aclaraciones | Anthropic | Análisis de bases + fragmentos de las bases | Bajo |
| `junta-aclaraciones/respuestas` | Extraer respuestas del acta | Anthropic | **El acta completa** + las preguntas originales | Bajo/medio |
| **`propuesta-economica/analizar`** | "Analizar competitividad con IA" | Anthropic | Las **partidas con precio ofertado**, precio de referencia, cantidad, unidad y total | **Precios ofertados** |
| **`generar-estudio-mercado`** | Estudio de mercado | Anthropic **con búsqueda web** | Descripción, unidad y cantidad de cada partida. **El proveedor ejecuta búsquedas en internet** (hasta 4 por partida) | No |
| `analizar-fallo` (Edge) y `seguimiento/analizar-fallo` | Analizar el acta de fallo | Anthropic | **El acta completa** (PDF). El total de nuestra propuesta se calcula en local y no se envía | Bajo |
| `estado-ia` | La UI consulta si la IA está disponible | — | **No llama a ningún proveedor**: lee el estado del circuit breaker en la base | — |

## 3. Qué no se envía (en el código revisado)
- **Llaves, contraseñas y certificados de e.firma:** la firma se genera en el navegador (`src/lib/efirma.ts`); el servidor solo recibe el certificado público y la firma. Ninguna función de IA los referencia.
- **Contraseñas y correos de las personas usuarias.**
- **Datos de otras organizaciones:** cada función lee con la sesión de la organización (RLS).
- Con `MOCK_AI` activo no se llama a ningún proveedor (solo pruebas locales).

## 4. Discrepancias encontradas
| Dónde | Qué dice | Qué hace el código |
|---|---|---|
| Aviso de privacidad (antes de este cambio) | "No compartimos propuestas económicas… con esos proveedores" | **Sí se envían** partidas y precios en `propuesta-economica/analizar`, `auditar-expediente` y `generar-estudio-mercado` |
| **Términos de uso** (`src/lib/terminos.ts`, punto 3) | "No se envían propuestas económicas ni llaves/certificados a esos proveedores" | Igual que arriba. **Corregido** en la versión `2026-10-23`, que obliga a todos los usuarios a aceptar de nuevo |
| Aviso (antes) | Solo mencionaba "documentos que subes" | También se envían datos del perfil de la empresa, preguntas, textos redactados y búsquedas web |

## 5. Controles que ya existen
- Guarda contra inyección de instrucciones en los prompts (`conGuardia`).
- El uso de IA solo registra **tokens** (`registrarUsoIA`), no contenido.
- Presupuesto diario por organización y circuit breaker por proveedor.
- Política de modelos por plan y gate de aprobación humana de resultados de IA, ambos detrás de flags (hoy apagados).

## 6. Condiciones de los proveedores (verificado el 2026-10-22 en sus páginas oficiales)
- **OpenAI (API):** no entrena con datos de la API por defecto; guarda registros de monitoreo de abuso **hasta 30 días**; la retención cero requiere **aprobación previa** de su equipo de ventas.
- **Anthropic (API / productos comerciales):** no entrena con entradas ni salidas por defecto. La página consultada no describe la retención cero ni el DPA: hay que revisar su Trust Center y los Términos Comerciales o preguntarles.
- Ninguna de las dos páginas consultadas describe cómo obtener un DPA: **pendiente** (A3).

## 7. Qué decidir a partir de esta tabla
1. ~~Corregir los términos de uso y subir la versión~~ (hecho, versión `2026-10-23`).
2. **Minimizar**, si se quiere: no enviar a OpenAI el texto de documentos personales del checklist (INE, poderes); poder apagar la búsqueda web del estudio de mercado.
3. **A3:** pedir el DPA a cada proveedor y, si procede, la retención cero. Confirmar que las cuentas de la API están a nombre de la empresa.
