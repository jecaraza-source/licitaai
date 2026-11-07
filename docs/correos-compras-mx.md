# Correos de Compras MX

Bandeja donde llegan los avisos que Compras MX envía a la empresa y desde la
que se asocia cada uno a una licitación existente.

## Cómo funciona

1. Cada empresa tiene una dirección de entrada propia:
   `<alias>@<CORREO_ENTRADA_DOMINIO>` (el alias está en
   `organizations.alias_correo`; la dirección se ve en **Correos**).
2. Esa dirección se registra como correo de contacto en Compras MX, o se
   reenvía a ella desde el correo que ya se usa.
3. Resend recibe el correo y llama al webhook
   `POST /api/webhooks/correo-entrante` (evento `email.received`).
4. El webhook verifica la firma, identifica a la empresa por el alias,
   guarda el correo (solo texto y metadatos de adjuntos) en
   `correos_compras_mx` y, si el número de expediente de una licitación de la
   empresa aparece en el correo, la deja como **sugerida**.
5. En **Correos** el usuario abre cada correo y lo **asocia** a una
   licitación (queda en su pestaña Seguimiento y en su historial), lo
   **descarta** o lo devuelve a la bandeja.

El contenido recibido no se puede editar (un trigger en la base lo impide).
Los archivos adjuntos no se guardan; el correo muestra sus nombres.

## Puesta en marcha (una sola vez, la hace quien administra el dominio)

`licitaai.mx` recibe su correo en GoDaddy: **no se toca el MX del dominio**
(`contacto@licitaai.mx` sigue como está). Solo se delega un subdominio.

1. En Resend → Domains, agrega el subdominio `entrada.licitaai.mx` con la
   recepción de correos activada. Resend muestra el registro MX (y los de
   verificación) que hay que crear.
2. En GoDaddy → DNS de `licitaai.mx`, crea esos registros **para el
   subdominio `entrada`** (no para el dominio raíz).
3. En Resend → Webhooks, crea un webhook al evento `email.received` con la URL
   `https://<dominio de la app>/api/webhooks/correo-entrante` y copia su
   secreto de firma.
4. En Vercel (Production) define:
   - `CORREO_ENTRADA_DOMINIO` = `entrada.licitaai.mx`
   - `RESEND_WEBHOOK_SECRET` = el secreto del paso 3
   - `RESEND_API_KEY` con permiso para leer correos recibidos (una llave solo
     de envío no basta).
5. Prueba: manda un correo a la dirección que muestra la pantalla **Correos**
   y revisa que aparezca como "Por revisar".

## Seguridad

- El webhook responde 503 si falta cualquier variable y 401 sin firma válida.
- Es idempotente por el id del correo en Resend (los reintentos no duplican).
- Un correo a una dirección que no es de ninguna empresa se ignora (200).
- Los remitentes que no son `*.gob.mx` se marcan como "Remitente no
  reconocido"; no se bloquean, porque Compras MX puede cambiar de dominio.
- Solo se guarda texto: el HTML del remitente nunca se almacena ni se
  muestra.
