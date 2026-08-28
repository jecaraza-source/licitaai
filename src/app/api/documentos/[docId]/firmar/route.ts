import { z } from "zod";
import { apiRoute, ApiError, requireWriteRole } from "@/lib/api";
import { getEmpresaPerfilActiva } from "@/lib/empresa-perfil";
import {
  certPermiteFirmar,
  hashDocumentoHex,
  parseCertificado,
  verificarFirma,
} from "@/lib/efirma";

// El certificado (.cer) es información pública — un X.509 típico pesa unos
// pocos KB; una firma RSA-4096 en base64 son ~700 caracteres. Estos topes
// solo existen para rechazar payloads absurdos/abusivos, no para acomodar
// casos legítimos límite.
const MAX_CER_BASE64 = 32 * 1024;
const MAX_FIRMA_BASE64 = 4 * 1024;

const paramsSchema = z.object({ docId: z.string().uuid("docId debe ser un UUID válido") });

const bodySchema = z
  .object({
    cer_base64: z.string().min(1, "cer_base64 requerido").max(MAX_CER_BASE64, "Certificado demasiado grande"),
    firma_base64: z.string().min(1, "firma_base64 requerido").max(MAX_FIRMA_BASE64, "Firma demasiado grande"),
    documento_hash_sha256: z.string().regex(/^[0-9a-f]{64}$/, "documento_hash_sha256 inválido"),
    confirmar_rfc_distinto: z.boolean().optional(),
  })
  .strict();

function normalizarRfc(rfc: string | null): string {
  return (rfc ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export const POST = apiRoute({ paramsSchema, bodySchema }, async ({ ctx, params, body }) => {
  // La firma modifica el documento — VIEWER no puede (mismo criterio P0.3).
  requireWriteRole(ctx);

  // RLS ya filtra: una fila de otra organización simplemente no aparece.
  const { data: documento } = await ctx.supabase
    .from("documentos")
    .select("id, storage_path, licitacion_id")
    .eq("id", params.docId)
    .maybeSingle();
  if (!documento) throw ApiError.notFound("Documento no encontrado");

  let certInfo;
  try {
    certInfo = parseCertificado(body.cer_base64);
  } catch {
    throw ApiError.validation("No se pudo leer el certificado (.cer)");
  }
  if (!certInfo.vigente) throw ApiError.validation("El certificado no está vigente");
  if (!certPermiteFirmar(body.cer_base64)) {
    throw ApiError.validation(
      "El certificado no está autorizado para firmar (keyUsage no incluye digitalSignature)",
    );
  }

  const empresa = await getEmpresaPerfilActiva(ctx.supabase, ctx.organizationId, ctx.userId, {
    fallbackToFirst: true,
  });
  const rfcCoincide =
    !empresa?.rfc || !certInfo.rfc
      ? null
      : normalizarRfc(empresa.rfc) === normalizarRfc(certInfo.rfc);
  if (rfcCoincide === false && body.confirmar_rfc_distinto !== true) {
    throw ApiError.validation(
      `El RFC del certificado (${certInfo.rfc}) no coincide con el de la empresa activa (${empresa?.rfc}). Confirma explícitamente si esto es correcto.`,
      { motivo: "rfc_distinto" },
    );
  }

  // Se descarga el documento del lado del servidor de forma independiente
  // (no se confía en el hash que mandó el cliente) para recalcular el hash
  // y verificar la firma sobre el contenido real.
  const { data: archivo, error: downloadError } = await ctx.supabase.storage
    .from("documentos-originales")
    .download(documento.storage_path);
  if (downloadError || !archivo) throw ApiError.internal();
  const documentBytes = await archivo.arrayBuffer();

  const hashServidor = hashDocumentoHex(documentBytes);
  if (hashServidor !== body.documento_hash_sha256) {
    throw ApiError.conflict(
      "El documento cambió entre que se calculó la firma y llegó al servidor",
    );
  }

  // Verificación central: prueba criptográficamente que firma_base64 fue
  // generada por la llave privada correspondiente a la llave pública de
  // cer_base64, sobre exactamente este documento. Nunca se recibió ni se
  // procesó la llave privada ni la contraseña.
  if (!verificarFirma(body.cer_base64, body.firma_base64, documentBytes)) {
    throw ApiError.validation("La firma no es válida para este certificado y documento");
  }

  const firmaDigitalJson = {
    tipo: "interna",
    algoritmo: "RSA-SHA256",
    firma_base64: body.firma_base64,
    documento_hash_sha256: hashServidor,
    certificado_base64: body.cer_base64,
    firmado_por: certInfo.nombre_comun,
    rfc: certInfo.rfc,
    numero_serie: certInfo.numero_serie,
    rfc_coincide_empresa: rfcCoincide,
    firmado_at: new Date().toISOString(),
    firmado_por_user_id: ctx.userId,
    empresa_perfil_id: empresa?.id ?? null,
  };

  const { data, error } = await ctx.supabase
    .from("documentos")
    .update({ firma_digital_json: firmaDigitalJson })
    .eq("id", params.docId)
    .select()
    .single();

  if (error) throw ApiError.internal();

  const { error: logError } = await ctx.supabase.from("actividad_log").insert({
    licitacion_id: data.licitacion_id,
    user_id: ctx.userId,
    accion: "documento_firmado",
    metadata_json: { documento_id: params.docId, rfc: certInfo.rfc, rfc_coincide_empresa: rfcCoincide },
  });
  if (logError) {
    console.error(
      "[api] no se pudo registrar actividad_log para documento_firmado:",
      JSON.stringify({ request_id: ctx.requestId }),
    );
  }

  return { data };
});

/**
 * Verificación bajo demanda: re-descarga el documento actual, recalcula su
 * hash y re-verifica la firma guardada contra el contenido ACTUAL — si el
 * archivo cambió después de firmarse, la verificación falla aquí sin
 * necesidad de mantener un flag de invalidación que se pueda desincronizar.
 */
export const GET = apiRoute({ paramsSchema }, async ({ ctx, params }) => {
  const { data: documento } = await ctx.supabase
    .from("documentos")
    .select("id, storage_path, firma_digital_json")
    .eq("id", params.docId)
    .maybeSingle();
  if (!documento) throw ApiError.notFound("Documento no encontrado");

  const firma = documento.firma_digital_json as
    | { certificado_base64?: string; firma_base64?: string; documento_hash_sha256?: string }
    | null;

  type VerificacionFirma = {
    firmado: boolean;
    valida?: boolean;
    documento_sin_cambios?: boolean;
    firma_criptograficamente_valida?: boolean;
  };

  if (!firma?.certificado_base64 || !firma.firma_base64) {
    return { data: { firmado: false } as VerificacionFirma };
  }

  const { data: archivo, error: downloadError } = await ctx.supabase.storage
    .from("documentos-originales")
    .download(documento.storage_path);
  if (downloadError || !archivo) throw ApiError.internal();
  const documentBytes = await archivo.arrayBuffer();
  const hashActual = hashDocumentoHex(documentBytes);

  const documentoSinCambios = hashActual === firma.documento_hash_sha256;
  const firmaValida = verificarFirma(firma.certificado_base64, firma.firma_base64, documentBytes);

  return {
    data: {
      firmado: true,
      valida: documentoSinCambios && firmaValida,
      documento_sin_cambios: documentoSinCambios,
      firma_criptograficamente_valida: firmaValida,
    } as VerificacionFirma,
  };
});
