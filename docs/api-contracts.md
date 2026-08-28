# P1.1 — Inventario y contrato de las API (`src/app/api`)

**Fase:** P1 (`quality/p1-stability-and-testing`), basada en `security/p0-multitenant-hardening`.
**Alcance:** las 59 rutas (`route.ts`) bajo `src/app/api`. El brief original hablaba de 55; el conteo real al momento de esta auditoría es 59 — la diferencia se explica por rutas añadidas en trabajo reciente (documentos técnicos, versión de propuesta técnica) que ya existían en el repo antes de arrancar esta fase.

## Cómo leer este documento

Cada ruta fue auditada leyendo su código completo y clasificada en las mismas 12 columnas que pidió el brief. Los hallazgos "adicionales" (inconsistencias, swallowed errors, fugas de mensajes internos, huecos de integridad cross-tenant) están agrupados al final de cada bloque temático — son el insumo real para P1.2–P1.6, no solo curiosidades.

**Corrección respecto al hallazgo original de los sub-agentes de auditoría**: dos de los cuatro bloques de auditoría (junta/propuesta y empresa-perfil/checklist) reportaron que `auditar-documento` y `analizar-documento-corporativo` (Edge Functions) "no tienen `check_ai_budget`/`check_rate_limit`", basado en un grep del texto literal de esas funciones. Es un falso negativo: ambas SÍ tienen ambos controles, a través de `authenticate(req, {..., maxPorMinuto: 20, requiereIA: true})` (`_shared/auth.ts`), que internamente llama a `check_rate_limit`/`check_ai_budget` — verificado leyendo el código real de ambas funciones línea por línea antes de escribir este documento. El hallazgo real y sí válido es otro: **las rutas de Next.js que invocan esas Edge Functions** (`checklist-items/[itemId]/documento`, `empresa-perfil/[id]/documentos/[docId]/analizar`) no hacen su propio pre-check de presupuesto de IA antes de invocar — dependen de que la Edge Function responda 429, lo cual funciona pero no es explícito en el código de la ruta ni sigue el mismo patrón que `preguntar`/`propuesta-tecnica/mejorar`/etc.

## Resumen ejecutivo de hallazgos transversales (las 59 rutas)

1. **Cero rutas usan Zod para el body, excepto `licitaciones/route.ts` (POST) y `licitaciones/[id]/route.ts` (PUT)** — las otras 57 validan manualmente con `typeof`/`Array.isArray`/truthy-checks de rigor muy dispar, desde razonablemente completo (`documentos/firmar`, `checklist-items/[itemId]`) hasta inexistente (`empresa-perfil` POST/PUT — el body se trata como `any` implícito).
2. **El mensaje crudo de Postgres/Supabase/un SDK (`error.message`) se devuelve directo al cliente en la gran mayoría de las rutas que mutan datos** — presente en más de 40 de las 59 rutas. Es el hallazgo más repetido de toda la auditoría.
3. **Forma de respuesta de éxito inconsistente**: `{data}` en la mayoría, pero también `{ok:true}`, `{data, count, page, pageSize, empresaScore}`, `{data, activaId}`, `{data, invitacionesPendientes, puedeInvitar}` — cada ruta inventa su propio shape adicional.
4. **Errores descartados por destructuring sin revisar `.error`** (no son `catch{}` vacíos, sino `const {data} = await supabase....` sin capturar `error`) — encontrado en decenas de queries a través de casi todos los archivos. Funcionalmente equivalente a un catch silencioso: un fallo de RLS o de conexión se confunde con "sin datos".
5. **Ningún archivo verifica explícitamente que un recurso anidado (documento_id, docId, itemId, partida_id, empresa_perfil id de la URL) pertenezca al padre correcto** — el aislamiento cross-tenant (entre organizaciones) lo da RLS consistentemente bien, pero el aislamiento cross-recurso **dentro de la misma organización** tiene al menos un hueco confirmado: `empresa-perfil/[id]/documentos/[docId]` (DELETE y `/analizar`) nunca compara `docId` contra el `id` (empresa_perfil) de la URL.
6. **Ningún archivo usa `any` como palabra clave explícita**, pero el body de `request.json()` sin schema es `any` implícito en la mayoría de las rutas sin Zod, y `empresa-perfil/route.ts` usa un cast de tipos (`body as {...}`) que cumple el mismo rol de escape hatch.
7. **Ninguna ruta hace su propio chequeo de rol en código salvo 4 excepciones**: `documentos/firmar` (excluye VIEWER), `organizacion/staff/[userId]` y `organizacion/staff/invitar` (exigen ADMIN), `auth/bienvenida` (exige que el email coincida con la sesión). El resto delega el control de rol 100% a RLS (`is_write_role()`), lo cual funciona pero significa que un fallo de escritura por rol insuficiente se ve como un 500 genérico de Postgres en vez de un 403 claro.
8. **Patrón "delete-then-insert" sin transacción** en al menos 2 rutas (`propuesta-economica` PUT, y el patrón de reconciliación en varias otras) — riesgo de pérdida de datos si el segundo paso falla tras el primero.
9. **Storage sin verificación de pertenencia**: `empresa-perfil/[id]/documentos` POST inserta un `storage_path` enviado por el cliente sin verificar que el archivo exista en el bucket ni que el prefijo corresponda a la organización — el bucket sí tiene policy RLS que lo exigiría al leer/escribir el archivo en sí, pero la fila de metadata en DB se crea sin esa verificación.
10. **Filtro dinámico sin escapar**: `licitaciones/route.ts` GET concatena `search` sin escapar dentro de un `.or(...)` de PostgREST — no es SQL injection directo, pero un `search` con `,` o `)` puede alterar la expresión de filtro evaluada.

Estos 10 puntos son exactamente lo que P1.1 (capa común) y P1.2 (integridad) están diseñados para cerrar de forma sistemática, no ruta por ruta.

---

## Bloque 1 — `licitaciones/*` (núcleo)

| Ruta | Método(s) | Recurso | Auth | Rol requerido | Entrada (validada cómo) | Salida | Errores posibles | Muta datos | Llama IA | Usa Storage | Necesita rate limit |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `licitaciones` | GET, POST | Listado/creación de licitaciones | Sesión Supabase | Ninguno explícito | GET: sin validar, `search` sin escapar en `.or()`. POST: **Zod** (`licitacionSchema`) | `{data,count,page,pageSize,empresaScore}` / POST `{data}` (201) | 401; 403 "Perfil no encontrado"; 400 Zod; 500 `error.message` crudo | No/Sí | No | No | No |
| `licitaciones/[id]` | GET, PUT, PATCH, DELETE | Detalle/edición/borrado | Sesión Supabase | Ninguno | GET/DELETE: ninguna. PUT: **Zod** parcial. PATCH: manual | `{data}` / DELETE `{ok:true}` | 401; 404/500 con `error.message` crudo | Sí (PUT/PATCH/DELETE) | No | No | No |
| `licitaciones/[id]/analisis` | GET | Resultado de análisis de bases | Sesión Supabase | Ninguno | Sin validación | `{data}` | 401; 500 crudo | No | No | No | No |
| `licitaciones/[id]/analizar-bases` | POST | Dispara análisis IA de bases (Edge Fn) | Sesión Supabase | Ninguno | `documento_id` sin `typeof` check | `{data}` | 401; 429; 404; 500 crudo del invoke | Indirecta | Sí (Edge Fn) | No | Ya tiene |
| `licitaciones/[id]/auditoria` | GET | Score/checklist de auditoría | Sesión Supabase | Ninguno | Sin validación | `{data}` | 401 (errores de 2 queries ignorados) | No | No | No | No |
| `licitaciones/[id]/auditoria/auditar-todos` | POST | Audita todos los ítems + expediente (IA) | Sesión Supabase | Ninguno | Sin validación | `{data}` | 401; 429; 500 crudo (solo del último invoke) | Indirecta | Sí (N Edge Fns) | No | Ya tiene (pero no limita fan-out de IA por ítem) |
| `licitaciones/[id]/documentos-convocante-no-aplica` | PATCH | Marca doc del convocante "no aplica" | Sesión Supabase | Ninguno | Manual `typeof` | `{data}` | 401; 400; 500 crudo | Sí | No | No | No |
| `licitaciones/[id]/documentos-legales` | GET | Estado docs legales requeridos | Sesión Supabase | Ninguno | Sin validación | `{data}` | 401; 404 genérico (error real descartado) | No | No | No | No |
| `licitaciones/[id]/documentos-legales/[tipo]/exportar` | GET | Genera .docx | Sesión Supabase | Ninguno | Allowlist manual de `tipo` | Binario .docx | 401; 400; 404; 400 "faltan datos" | No | No | No | No |
| `licitaciones/[id]/documentos-tecnicos` | GET | Estado docs técnicos requeridos | Sesión Supabase | Ninguno | Sin validación | `{data}` | 401; 404 genérico | No | No | No | No |
| `licitaciones/[id]/documentos-tecnicos/[tipo]/exportar` | GET | Genera .docx | Sesión Supabase | Ninguno | Allowlist manual | Binario .docx | 401; 400; 404 | No | No | No | No |
| `licitaciones/[id]/estado` | POST | Cambia estado (gate de liberación) | Sesión Supabase | Ninguno | **Zod** (`estadoLicitacionSchema`) | `{data}` | 401; 400 Zod; 409 gate; 500 crudo | Sí | No | No | No |
| `licitaciones/[id]/estudio-mercado` | POST | Genera estudio de mercado (IA) | Sesión Supabase | Ninguno | Manual `typeof`, body tolerante a inválido | `{data}` | 401; 429; 404; 500 crudo | Indirecta | Sí (Edge Fn) | No | Ya tiene |
| `licitaciones/[id]/evidencia-envio` | GET, POST | Evidencia de envío | Sesión Supabase | Ninguno | Manual, tipos incorrectos se silencian a `null` | `{data}` | 401; 500 crudo | Sí (POST) | No | No | No |
| `licitaciones/[id]/jerarquia` | GET, PUT, POST | Cadena ejecutor→integrador→supervisor | Sesión Supabase | Self-check de negocio (no rol de app) | Manual, allowlist de `nivel` | `{data}` | 401; 400; 403; 409; 500 crudo; **excepción no capturada** en `obtenerOCrear` | Sí | No | No | No |

**Hallazgos adicionales de este bloque**: `search` sin escapar en `licitaciones` GET (filtro PostgREST); 3 escrituras encadenadas sin transacción en POST (licitación→checklist→actividad_log, con el insert de checklist_items sin chequear error); `auditar-todos` dispara N invocaciones de IA en un loop sin `Promise.all` ni límite de concurrencia y sin revisar el resultado de cada una (vector de abuso de costo); `jerarquia`'s `obtenerOCrear` puede lanzar una excepción no controlada fuera del patrón `{error}` del resto del archivo.

## Bloque 2 — `licitaciones/[id]/{junta-aclaraciones,liberacion,partidas,preguntar,procesar-documento,propuesta-economica,propuesta-tecnica}*`

| Ruta | Método(s) | Recurso | Auth | Rol requerido | Entrada (validada cómo) | Salida | Errores posibles | Muta datos | Llama IA | Usa Storage | Necesita rate limit |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `junta-aclaraciones` | GET, PUT | Preguntas/respuestas de junta | Sesión Supabase | Ninguno (RLS exige write en PUT) | Manual, sin enum para `estado` | `{data}` | 401; 500 crudo | Sí | No | No | No |
| `junta-aclaraciones/exportar` | POST | Export .docx | Sesión Supabase | Ninguno | N/A | Binario | 401; 404 genérico | No | No | No | No |
| `junta-aclaraciones/generar` | POST | Genera preguntas (Edge Fn) | Sesión Supabase | Ninguno | N/A | `{data}` | 401; 429; 500 crudo | Indirecta | Sí (Edge Fn) | No | Rate limit sí; **budget de IA no pre-chequeado en la ruta** (la Edge Fn `generar-preguntas-junta` tampoco tiene `requiereIA` — confirmado, a diferencia de auditar-documento/analizar-documento-corporativo) |
| `junta-aclaraciones/respuestas` | POST | Extrae respuestas del acta (IA) | Sesión Supabase | Ninguno | Manual `if(!documento_id)` | `{data}` | 401; 429×2; 400; 404; 500 (uno genérico, uno crudo) | Sí | Sí (directo) | Sí (download) | Ya tiene (wiring P0.6 completo) |
| `junta-aclaraciones/vincular` | POST | Vincula checklist a la junta | Sesión Supabase | Ninguno | Manual `Array.isArray` | `{ok,actualizados}` | 401; 400; 404 (sin rama 500 — errores del loop descartados) | Sí | No | No | No |
| `liberacion` | GET, PUT | Gate antes de enviar | Sesión Supabase | Ninguno | Manual `typeof` | `{data}` | 401; 400; 500 crudo | Sí | No | No | No |
| `partidas` | GET | Partidas + estudio de mercado | Sesión Supabase | Ninguno | N/A | `{data}` | 401; 500 crudo | No | No | No | No |
| `preguntar` | POST | RAG Q&A sobre bases | Sesión Supabase | Ninguno | Manual, **sin límite de longitud** | `{data}` | 401; 429×2; 400; 500 crudo (searchError) | No | Sí (embeddings+Claude) | No | Ya tiene (pero `logAiUsage` no contabiliza tokens de embeddings) |
| `procesar-documento` | POST | Extracción+embeddings (Edge Fn) | Sesión Supabase | Ninguno | Manual, valida tenant del documento explícitamente (bien) | `{data}` | 401; 429; 400; 404; 500 crudo | Indirecta | Sí (Edge Fn) | No | Rate limit sí; Edge Fn `procesar-documento` **sí** tiene `requiereIA:true` (confirmado en código — verificado, no es un gap real) |
| `propuesta-economica` | GET, PUT | Config + partidas económicas | Sesión Supabase | Ninguno | PUT: cast de tipos sin validación real, sin rangos numéricos | `{data}` / `{ok:true}` | 401 (mayoría de errores de GET/PUT no revisados) | Sí — **delete-then-insert sin transacción** | No | No | No |
| `propuesta-economica/analizar` | POST | Dictamen IA de competitividad | Sesión Supabase | Ninguno | N/A | `{data}` | 401; 429×2; 400 | No | Sí (streaming) | No | Ya tiene |
| `propuesta-tecnica` | GET, PUT | Contenido de propuesta técnica | Sesión Supabase | Ninguno | Manual, solo truthy-check de `contenido_json` | `{data}` | 401; 500 crudo; 400; 404 | Sí | No | No | No |
| `propuesta-tecnica/exportar` | POST | Export .docx / Anexo A | Sesión Supabase | Ninguno | Query param sin validar formalmente | Binario | 401; 404 genérico | No | No | No | No |
| `propuesta-tecnica/generar` | POST | Genera propuesta técnica (Edge Fn) | Sesión Supabase | Ninguno | N/A | `{data}` | 401; 429; 500 crudo | Indirecta | Sí (Edge Fn) | No | Rate limit sí; Edge Fn no tiene `requiereIA` — gap real, ver Bloque 4 recomendaciones |

**Hallazgos adicionales de este bloque**: `generar-preguntas-junta` (Edge Fn) confirmado SIN `requiereIA: true` en su `authenticate()` — a diferencia de `auditar-documento`/`analizar-documento-corporativo`/`procesar-documento`, esta función y `generar-propuesta-tecnica` no tienen tope de presupuesto de IA propio (dependen solo del rate limit por minuto); `propuesta-economica` PUT es el caso más claro de operación parcial sin transacción de todo el inventario (partidas económicas completas pueden perderse); `junta-aclaraciones/vincular` actualiza en loop sin revisar ningún error individual.

## Bloque 3 — `licitaciones/[id]/{propuesta-tecnica/mejorar,revisor,version,requisitos-tecnicos,responsabilidades,seguimiento,viabilidad}`, `checklist-items/*`, `empresa-perfil/*`

| Ruta | Método(s) | Recurso | Auth | Rol requerido | Entrada (validada cómo) | Salida | Errores posibles | Muta datos | Llama IA | Usa Storage | Necesita rate limit |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `propuesta-tecnica/mejorar` | POST | Mejora redacción HTML (IA) | Sesión Supabase | Ninguno | Manual `typeof` | `{data}` | 401; 429×2; 400 | No (no persiste) | Sí (directo) | No | Ya tiene |
| `propuesta-tecnica/revisor` | POST | Doble check de revisor | Sesión Supabase | Self-check (`user.id===revisor_id`) | Manual, sin `typeof` en varios campos | `{data}` | 401; 404; 400; 403; 500 crudo×2 | Sí | No | No | No |
| `propuesta-tecnica/version` | POST | Snapshot de versión | Sesión Supabase | Ninguno | Manual, JSON tolerante | `{data}` | 401; 404; 500 crudo | Sí | No | No | No |
| `requisitos-tecnicos` | GET, POST | Requisitos técnicos | Sesión Supabase | Ninguno | Manual `typeof`/trim | `{data}` (201) | 401; 400; 500 crudo×2 | Sí | No | No | No |
| `responsabilidades` | GET, PUT | Asignación de responsables | Sesión Supabase | Ninguno | Sin validar shape de array antes de `.map` | `{data}` | 401; 500 crudo; **riesgo TypeError no controlado** | Sí | No | No | No |
| `seguimiento` | GET, PUT | Datos post-adjudicación | Sesión Supabase | Ninguno | Manual, whitelist extensa por campo | `{data}` | 401; 500 crudo×2 | Sí | No | No | No |
| `seguimiento/analizar-fallo` | POST | Analiza acta de fallo (IA) | Sesión Supabase | Ninguno | Manual `!documento_id` | `{data}` | 401; 429×2; 400; 404; 500×2 | Sí | Sí (directo) | Sí (download) | Ya tiene |
| `viabilidad` | GET, PUT | Cuestionario Go/No-Go | Sesión Supabase | Ninguno | Enum inline; mismo riesgo TypeError que `responsabilidades` | `{data}` | 401; 500 crudo | Sí | No | No | No |
| `checklist-items/[itemId]` | PATCH | Actualiza ítem de checklist | Sesión Supabase | Ninguno | Manual, whitelist extensa (buen patrón anti mass-assignment) | `{data}` | 401; 500 crudo (incluye "no rows" mal mapeado) | Sí | No | No | No |
| `checklist-items/[itemId]/documento` | POST | Adjunta documento + audita (Edge Fn) | Sesión Supabase | Ninguno | Manual `!documento_id` | `{data}` | 401; 429; 400; 500 crudo del invoke | Sí (UPDATE previo sin chequear error) | Sí (Edge Fn `auditar-documento`, **sí** tiene budget interno) | No directo | Rate limit sí; sin pre-check de budget en la ruta (aceptable: la Edge Fn ya lo aplica) |
| `empresa-perfil` | GET, POST | Perfiles de empresa | Sesión Supabase | Ninguno explícito (RLS en POST) | **Sin validación de tipos en absoluto** en POST | `{data,activaId}` / `{data}` | 401; 403; 500 crudo×2 | Sí (POST, UPDATE users sin chequear error) | No | No | No |
| `empresa-perfil/[id]` | GET, PATCH, PUT | Perfil individual | Sesión Supabase | Ninguno (RLS en PATCH/PUT) | PATCH manual; **PUT sin validación en absoluto** | `{data}` | 401; 500 crudo×3 | Sí | No | No | No |
| `empresa-perfil/[id]/documentos` | GET, POST | Documentos corporativos | Sesión Supabase | Ninguno en GET; RLS en POST | POST truthy-only, **sin verificar que storage_path exista/pertenezca** | `{data}` (201) | 401; 403; 400; 500 crudo×2 | Sí | No | Referencia sin verificar | No |
| `empresa-perfil/[id]/documentos/[docId]` | DELETE | Elimina documento corporativo | Sesión Supabase | Ninguno (RLS) | Sin body; **no valida que docId pertenezca a `id`** | `{ok:true}` | 401; 500 crudo | Sí (Storage remove sin chequear error, orden invertido: Storage antes que DB) | No | Sí (remove) | No |
| `empresa-perfil/[id]/documentos/[docId]/analizar` | POST | Análisis IA de doc corporativo (Edge Fn) | Sesión Supabase | Ninguno | Body opcional tolerante | `{data}` | 401; 500 crudo del invoke | Probable (vía Edge Fn) | Sí (Edge Fn `analizar-documento-corporativo`, **sí** tiene budget interno) | No directo | Sin rate limit ni pre-check en la ruta (la Edge Fn sí protege; la ruta debería tener rate limit igualmente, ver recomendaciones) |

**Hallazgos adicionales de este bloque**: `empresa-perfil` POST y `empresa-perfil/[id]` PUT son los dos archivos con menor validación de todo el inventario (ningún campo tipado, ni siquiera RFC/fechas/montos); `empresa-perfil/[id]/documentos/[docId]` invierte el orden seguro de una operación compensatoria (borra de Storage primero, de DB después, sin comprobar ningún resultado — riesgo de fila huérfana en DB si el remove de Storage falla, y de archivo huérfano en Storage si el DB delete falla); ninguna ruta de este bloque valida que `docId`/`itemId` pertenezcan al padre correcto dentro de la misma organización (hueco de integridad cross-recurso, no cross-tenant).

## Bloque 4 — `auth/*`, `cron/*`, `dashboard/*`, `documentos/*`, `efirma/*`, `organizacion/*`, `referencias-legales/*`, `requisitos-tecnicos/*`

| Ruta | Método(s) | Recurso | Auth | Rol requerido | Entrada (validada cómo) | Salida | Errores posibles | Muta datos | Llama IA | Usa Storage | Necesita rate limit |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `auth/bienvenida` | POST | Email de bienvenida | Sesión Supabase | Implícito: `user.email===email` | Manual `typeof email` | `{ok:true}` | 400; 403; sin try/catch en `.json()` | No | No | No | No |
| `cron/alertas-vencimiento` | GET | Notifica licitaciones por vencer | `Bearer CRON_SECRET` (`estaAutorizadoCron`, no sesión) | N/A (endpoint de servicio) | N/A | `{ok:true,licitaciones_notificadas}` | 401 (fail-closed, P0.6); 500 crudo | Sí (UPDATE en loop, errores de loop no revisados) | No | No | N/A |
| `dashboard/stats` | GET | Estadísticas agregadas | Sesión Supabase | Ninguno | N/A | `{data}` | 401 (errores de 5 queries en Promise.all ignorados) | No | No | No | No |
| `documentos/[docId]/firmar` | POST, GET | Firma e.firma + re-verificación | Sesión Supabase | Excluye VIEWER | Manual, regex hex + longitud (razonablemente completo) | `{data}` | 401; 403; 400; 404; 409; 500 crudo (uno) | Sí | No | Sí (download) | No, recomendable (operación cara) |
| `efirma/validar-certificado` | POST | Parseo de certificado .cer | Sesión Supabase | Ninguno | Manual `typeof`/longitud | `{data}` | 401; 400 (mensaje crudo de la excepción del parser) | No | No | No | No |
| `empresa-perfil/reiniciar` | POST | Limpia empresa activa | Sesión Supabase | Ninguno | N/A | `{ok:true}` | 401; 500 crudo | Sí | No | No | No |
| `empresa-perfil/seleccionar` | POST | Selecciona empresa activa | Sesión Supabase | Ninguno | Manual, **solo truthy**, sin `typeof` | `{ok:true}` | 401; 400; 403; 404; 500 crudo | Sí | No | No | No |
| `organizacion/staff` | GET | Lista staff + invitaciones | Sesión Supabase | Visibilidad de email condicionada a ADMIN | N/A | `{data,invitacionesPendientes,puedeInvitar}` | 401; 403; 500 crudo | No | No | No | No |
| `organizacion/staff/[userId]` | PATCH | Edita rol_jerarquico | Sesión Supabase | **ADMIN** | Manual, whitelist | `{data}` | 401; 403; 400; 500 crudo (incluye "no rows" mal mapeado a 500) | Sí (scoped a organization_id — correcto) | No | No | No |
| `organizacion/staff/invitar` | POST | Crea invitación + email | Sesión Supabase | **ADMIN** | Manual, `email.includes("@")` (no regex real) | `{ok:true}` | 401; 403; 400; 500 crudo | Sí | No | No | Sí — sin límite, riesgo de spam de invitaciones |
| `organizacion/usuarios` | GET | Lista simple de usuarios | Sesión Supabase | Ninguno | N/A | `{data}` | 401; 403; 500 crudo | No | No | No | No |
| `referencias-legales` | GET | Catálogo de referencias legales | Sesión Supabase | Ninguno | N/A | `{data}` | 401; 500 crudo (error de query secundaria ignorado) | No | No | No | No |
| `referencias-legales/buscar` | GET | Búsqueda FTS | Sesión Supabase | Ninguno | `q` truthy; `referencia_legal_id` sin validar formato | `{data}` | 401; 400; 500 crudo | No | No (FTS Postgres, no IA) | No | No |
| `referencias-legales/preguntar` | POST | RAG legal (IA) | Sesión Supabase | Ninguno (ni VIEWER excluido) | Manual `typeof` | `{data}` | 401; 429×2; 400; 500 crudo | No | Sí (embeddings+Claude) | No | Ya tiene |
| `requisitos-tecnicos/[itemId]` | PATCH, DELETE | Requisito técnico individual | Sesión Supabase | **Ninguno — ni perfil/org se obtiene** | Manual por campo (PATCH) | `{data}` / `{ok:true}` | 401; 500 crudo (incluye "no rows" mal mapeado) | Sí | No | No | No |

**Hallazgos adicionales de este bloque**: `requisitos-tecnicos/[itemId]` es la única ruta de las 59 que ni siquiera obtiene el perfil/organización del usuario — depende 100% de RLS sin ninguna capa de aplicación; `cron/alertas-vencimiento` tiene el patrón de errores de loop descartados igual que otras rutas, con el agravante de que un fallo silencioso ahí significa que una organización deja de recibir alertas de vencimiento sin que nadie se entere; `organizacion/staff/invitar` puede usarse para enviar invitaciones (y por tanto emails) sin límite, un vector de abuso/spam de bajo riesgo pero real; `documentos/firmar` y `efirma/validar-certificado` (ambos P0.3) son, junto con `preguntar`/`propuesta-tecnica/mejorar`/etc (P0.6), los ejemplos de mejor validación/manejo de errores del inventario completo — el resto del código no ha tenido el mismo nivel de escrutinio hasta esta fase.

---

## Estado de la capa común (P1.1 — completa)

Construida en `src/lib/api/` (`errors.ts`, `response.ts`, `log.ts`, `context.ts`, `validate.ts`, `handler.ts`, barrel en `index.ts`):

- **Autenticación/autorización/organización activa**: `requireApiContext()` resuelve sesión + `organization_id`/`rol` server-side (mismo patrón que `_shared/auth.ts` de las Edge Functions); `requireRole()`/`requireWriteRole()` para autorización por rol.
- **Validación de params/query/body**: `validarParams()`/`validarQuery()`/`validarBody()`, todas basadas en Zod, con límite de tamaño de payload (`PAYLOAD_TOO_LARGE`) antes de parsear.
- **Respuestas uniformes**: `apiOk()`/`apiErrorResponse()` implementan exactamente el sobre `{data, error, meta:{request_id}}` especificado en el brief.
- **Manejo de excepciones + IDs de correlación + registro seguro**: `apiRoute()` genera un `request_id` por request, captura cualquier excepción (mapea `ApiError` a su código/status; cualquier otro throw se convierte en `INTERNAL_ERROR` sin exponer el mensaje real), y `logApiError()` registra server-side con el `request_id`, redactando campos con nombres sensibles.
- **Rate limiting y presupuesto de IA**: opciones `rateLimit`/`aiBudget` en la config de `apiRoute()`, reutilizando `checkRateLimit`/`checkAiBudget` ya existentes de P0.6.

**Estado de la migración (todas las rutas con sesión de usuario migradas a `apiRoute()`):**

- Bloques 1–4 de licitaciones, junta/propuesta, empresa-perfil/checklist: migrados en los commits `4b3120c` / `d443c60` / `147445a`.
- Rutas de dominio restantes migradas en este commit: `organizacion/usuarios`, `organizacion/staff` (+ `[userId]`, `invitar`), `empresa-perfil/reiniciar`, `empresa-perfil/seleccionar`, `requisitos-tecnicos/[itemId]`, `dashboard/stats`, `efirma/validar-certificado`, `auth/bienvenida`, `referencias-legales` (+ `buscar`, `preguntar`), `documentos/[docId]/firmar`.
- **No migradas por diseño** (no tienen sesión de usuario — usan otro mecanismo de autorización): `health`, `ready`, `estado` (públicas, sin auth), `cron/*` (`estaAutorizadoCron` con `CRON_SECRET`), `admin/salud` (gate por `PLATFORM_ADMIN_EMAILS`).

**Cambios incompatibles introducidos por la migración** (el frontend ya se actualizó en el mismo commit):

- Toda ruta migrada responde ahora con el sobre `{data, error: {code, message, details?}, meta: {request_id}}`. Las respuestas de error ya no traen el `error.message` crudo de Postgres/Supabase/un SDK.
- `GET /api/organizacion/staff`: `invitacionesPendientes` y `puedeInvitar` pasaron de campos de nivel superior a `data.invitacionesPendientes` / `data.puedeInvitar`; la lista de personas pasó de `data` a `data.miembros`.
- `POST /api/documentos/[docId]/firmar`: el caso "RFC distinto" pasó de `{error: "rfc_distinto", detalle}` a un `VALIDATION_ERROR` con `error.details.motivo === "rfc_distinto"`.
- `POST /api/organizacion/staff/invitar`: ahora tiene rate limit (`max: 10`/min) y valida el correo con `z.string().email()` en vez de `includes("@")`.

## Recomendaciones para P1.2 (integridad — commit siguiente)

1. Envolver en una transacción/RPC el patrón delete-then-insert de `propuesta-economica` PUT.
2. Corregir el orden de la operación compensatoria en `empresa-perfil/[id]/documentos/[docId]` DELETE.
3. Añadir una restricción de integridad para que `docId` en `empresa-perfil/[id]/documentos/[docId]*` pertenezca al `empresa_perfil_id` de la URL.
4. Escapar/parametrizar el filtro `search` de `licitaciones/route.ts` en vez de interpolarlo en `.or()`.

**Ya resuelto** (P1.1): `requiereIA: true` añadido a `generar-preguntas-junta` y `generar-propuesta-tecnica` — ver commits P2 (`e24e269`); confirmado en el código actual de ambas funciones.
