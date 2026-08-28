import { z } from "zod";
import { apiRoute, ApiError } from "@/lib/api";
import { parseCertificado } from "@/lib/efirma";

const bodySchema = z
  .object({
    cer_base64: z.string().min(1, "cer_base64 requerido").max(32 * 1024, "Certificado demasiado grande"),
  })
  .strict();

export const POST = apiRoute({ bodySchema }, async ({ body }) => {
  try {
    return { data: parseCertificado(body.cer_base64) };
  } catch {
    // El mensaje crudo del parser puede exponer detalles de la librería —
    // se devuelve un mensaje genérico y seguro.
    throw ApiError.validation("No se pudo leer el certificado (.cer)");
  }
});
