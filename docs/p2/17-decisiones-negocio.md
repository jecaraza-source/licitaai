# P2 · Decisiones de negocio pendientes de firma

Dos decisiones bloquean el criterio de terminación de P2. Ninguna es
código; ambas necesitan una firma con fecha. Guarda la versión firmada
(o el acuerdo por correo) junto a este documento.

---

## A2 · Punto de recuperación (RPO) de la base de datos

### El hecho

Hoy no hay backup de producción. P2.7 implementó `pg_dump` diario cifrado
con verificación de integridad (`.github/workflows/backup.yml`), que se
activa en cuanto se cargue el proyecto de producción y sus secrets.

### Las opciones

| Opción | Coste | RPO (datos que se pueden perder) | RTO (tiempo de recuperación) |
|---|---|---|---|
| **`pg_dump` diario** (implementado) | ~$0 (GitHub Actions + almacenamiento externo) | **hasta 24 h** | ~4 h (restauración manual asistida por el runbook) |
| **Supabase PITR** (add-on del plan Pro) | **~$100 / mes** | **≤ 1 h**, típicamente ~2 min con retención de 7 días | menor — restauración asistida por Supabase a un timestamp exacto |

### Recomendación de ingeniería

- **Hasta el primer cliente de pago con SLA:** `pg_dump` diario es
  suficiente **si el negocio acepta por escrito** poder perder hasta 24 h
  de datos ante un desastre de Postgres (borrado accidental masivo,
  corrupción, pérdida de región).
- **Antes del primer cliente de pago con SLA:** activar PITR. $100/mes es
  bajo frente al coste reputacional de perder expedientes de licitación de
  un cliente.

Detalle técnico en `14-backup-y-restauracion.md` §4. Riesgo asociado: R9.

### Para firmar (marcar una)

> ☑ **Aceptamos el RPO interino de 24 horas** con `pg_dump` diario. Somos
> conscientes de que un desastre de Postgres puede costar hasta 24 horas de
> datos. Revisaremos esta decisión antes de firmar el primer contrato con
> SLA.
>
> ☐ **Aprobamos el add-on de PITR** (~$100/mes) en el plan Pro de Supabase
> de producción. RPO objetivo ≤ 1 hora.
>
> Nombre: ________________  Cargo: ________________  Fecha: __________

**Decisión registrada (2026-08-28):** se acepta el RPO de 24 h con
`pg_dump` diario. Pendiente de re-evaluar **antes del primer cliente con
SLA**. Cierra parcialmente R9 (queda el compromiso de revisión).

---

## A3 · Envío de contenido de clientes a proveedores de IA

### El hecho

Para analizar bases, generar propuestas y auditar documentos, el sistema
envía **el texto de los documentos de la licitación** a proveedores de IA
externos:

| Proveedor | Qué recibe | Para qué |
|---|---|---|
| **Anthropic (Claude)** | fragmentos de texto de bases, actas, requisitos; nunca archivos binarios completos salvo un PDF escaneado que hay que transcribir | análisis, generación de propuesta técnica, auditoría, extracción de PDF escaneado |
| **OpenAI** | fragmentos de texto para vectorizar (`text-embedding-3-small`) | búsqueda semántica (RAG) dentro del expediente |

### Medidas ya implementadas (minimización)

- Solo se envían los **fragmentos necesarios** para cada operación, no el
  expediente completo.
- **Nunca** se envían: propuestas económicas, llaves/firmas, ni datos de
  pago.
- Guardia anti prompt-injection en las 15 llamadas (P0.6).
- Trazabilidad append-only: `ai_results` + `ai_result_citations` registran
  qué se usó en cada análisis.
- En el borrado de organización se documenta lo que el proveedor conserva
  (ver `13-clasificacion-datos.md` §5).

### Lo que falta decidir/hacer (negocio + legal)

1. **Confirmar el modo de retención con cada proveedor.** Anthropic y
   OpenAI ofrecen, en sus planes de negocio/API, **retención cero** y
   **no-entrenamiento** sobre los datos de la API. Hay que:
   - contratar el plan/opción que lo garantice, y
   - firmar el **DPA** (Data Processing Addendum) de cada uno.
2. **Divulgarlo en los términos de uso** de LicitaAI (los proveedores son
   subprocesadores).
3. **Ofrecer al cliente la lista de subprocesadores** y notificar cambios.

### Texto propuesto para los términos de uso

> **Procesamiento por terceros (subprocesadores de IA).** Para prestar sus
> funciones de análisis y generación asistida, LicitaAI transmite
> fragmentos del contenido de los documentos que usted carga a proveedores
> de inteligencia artificial que actúan como subprocesadores: **Anthropic,
> PBC** (modelo Claude) y **OpenAI, L.L.C.** (generación de *embeddings*).
> Estos proveedores procesan los datos únicamente para devolver el
> resultado solicitado, bajo acuerdos de tratamiento de datos que prohíben
> su uso para entrenamiento de modelos y establecen su eliminación tras el
> procesamiento. LicitaAI no transmite propuestas económicas, credenciales
> ni datos de pago a estos proveedores. La lista vigente de subprocesadores
> está disponible en [enlace] y se notificará cualquier cambio con [N]
> días de antelación.

### Cláusula propuesta para el DPA con el cliente (subprocesadores)

> El Cliente autoriza el uso de los subprocesadores listados en el Anexo
> [X]. LicitaAI notificará por escrito la incorporación o sustitución de
> cualquier subprocesador con al menos [30] días de antelación, período
> durante el cual el Cliente podrá objetar por motivos razonables de
> protección de datos. Cada subprocesador está sujeto a obligaciones de
> protección de datos no menos estrictas que las de este DPA.
>
> **Anexo [X] — Subprocesadores:**
> | Subprocesador | Actividad | Ubicación del tratamiento | Salvaguardas |
> |---|---|---|---|
> | Supabase, Inc. | Base de datos, autenticación, almacenamiento | [región del proyecto] | DPA + [SCCs si aplica] |
> | Vercel, Inc. | Hosting de la aplicación | [región] | DPA + SCCs |
> | Anthropic, PBC | Análisis y generación con IA | EE. UU. | DPA (retención cero, no-entrenamiento) + SCCs |
> | OpenAI, L.L.C. | Vectorización de texto (embeddings) | EE. UU. | DPA (retención cero, no-entrenamiento) + SCCs |
> | Resend (Plusdocs, Inc.) | Envío de correo transaccional | EE. UU. | DPA |
> | Sentry (Functional Software, Inc.) | Monitoreo de errores | [región] | DPA + scrubbing de PII |

### Para firmar

> ☐ Legal ha revisado el texto de términos de uso y la cláusula de DPA
> anteriores, o ha provisto la redacción definitiva.
>
> ☐ Se han firmado los DPA de Anthropic y OpenAI en modo retención
> cero / no-entrenamiento.
>
> ☐ Se ha contratado el plan/opción de API que garantiza lo anterior.
>
> Responsable legal: ________________  Fecha: __________

Riesgo asociado: R7.
