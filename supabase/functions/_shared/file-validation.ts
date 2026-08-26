// LicitaAI — P0.5: inspección de magic bytes.
//
// El allowlist de allowed_mime_types en storage.buckets (ver migración
// 20260826220000) solo valida el Content-Type que el cliente DECLARA al
// subir — un cliente que declare "application/pdf" pero suba bytes
// completamente distintos lo pasaría igual. Esto inspecciona el
// CONTENIDO real, en las Edge Functions que ya descargan el archivo del
// lado del servidor para procesarlo (procesar-documento,
// analizar-documento-corporativo), antes de tratarlo como el tipo que su
// nombre/extensión sugiere o de enviarlo a un modelo de IA.

export type TipoDetectado = "pdf" | "docx-o-xlsx" | "jpeg" | "png" | "desconocido";

function coincide(bytes: Uint8Array, firma: number[], offset = 0): boolean {
  if (bytes.length < offset + firma.length) return false;
  return firma.every((b, i) => bytes[offset + i] === b);
}

/** Identifica el tipo real de archivo por sus primeros bytes, ignorando
 * por completo la extensión del nombre o el Content-Type declarado. */
export function detectarTipoPorMagicBytes(bytes: Uint8Array): TipoDetectado {
  // "%PDF-"
  if (coincide(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "pdf";
  // "PK\x03\x04" — DOCX/XLSX son ambos contenedores ZIP/OOXML; distinguir
  // entre ellos requeriría abrir el ZIP, innecesario para este chequeo.
  if (coincide(bytes, [0x50, 0x4b, 0x03, 0x04])) return "docx-o-xlsx";
  if (coincide(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (coincide(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  return "desconocido";
}

/** true si el contenido real (magic bytes) corresponde con lo que el
 * nombre del archivo dice ser. Rechaza explícitamente cualquier
 * desajuste — un .pdf cuyo contenido no empieza con "%PDF-" no se
 * procesa ni se envía a un modelo de IA, sin importar qué Content-Type
 * haya declarado el cliente al subirlo. */
export function contenidoCoincideConNombre(bytes: Uint8Array, nombre: string): boolean {
  const lower = nombre.toLowerCase();
  const tipo = detectarTipoPorMagicBytes(bytes);

  if (lower.endsWith(".pdf")) return tipo === "pdf";
  if (lower.endsWith(".docx") || lower.endsWith(".xlsx")) return tipo === "docx-o-xlsx";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return tipo === "jpeg";
  if (lower.endsWith(".png")) return tipo === "png";
  // Extensión no reconocida por este chequeo (p. ej. .txt para
  // referencias legales) — no hay una firma de magic bytes universal
  // para texto plano, así que no se bloquea aquí.
  return true;
}
