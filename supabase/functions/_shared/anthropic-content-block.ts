// P0.6 (additional finding, non-security) — auditar-documento y
// analizar-documento-corporativo enviaban imágenes (JPEG) dentro de un
// bloque `type: "document"`, que la API de Anthropic solo acepta para
// application/pdf. Un documento escaneado como imagen habría fallado la
// llamada al modelo (la auditoría de ese documento simplemente nunca
// funcionaba). bloqueDocumentoParaClaude elige el tipo de bloque correcto
// según el media type real.
export type MediaTypeSoportado = "application/pdf" | "image/jpeg" | "image/png";

export function bloqueDocumentoParaClaude(mediaType: MediaTypeSoportado, base64: string) {
  if (mediaType === "application/pdf") {
    return {
      type: "document" as const,
      source: { type: "base64" as const, media_type: mediaType, data: base64 },
    };
  }
  return {
    type: "image" as const,
    source: { type: "base64" as const, media_type: mediaType, data: base64 },
  };
}
