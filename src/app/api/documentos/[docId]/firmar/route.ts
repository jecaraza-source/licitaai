import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
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
const HASH_HEX_RE = /^[0-9a-f]{64}$/;

function normalizarRfc(rfc: string | null): string {
  return (rfc ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ docId: string }> },
) {
  const { docId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { data: perfil } = await supabase
    .from("users")
    .select("organization_id, rol")
    .eq("id", user.id)
    .single();
  if (!perfil) {
    return NextResponse.json({ error: "Perfil no encontrado" }, { status: 403 });
  }
  if (perfil.rol === "VIEWER") {
    return NextResponse.json(
      { error: "Tu rol (VIEWER) no permite firmar documentos" },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Cuerpo de la solicitud inválido" }, { status: 400 });
  }
  const { cer_base64, firma_base64, documento_hash_sha256, confirmar_rfc_distinto } = body;

  if (typeof cer_base64 !== "string" || cer_base64.length === 0) {
    return NextResponse.json({ error: "cer_base64 requerido" }, { status: 400 });
  }
  if (cer_base64.length > MAX_CER_BASE64) {
    return NextResponse.json({ error: "Certificado demasiado grande" }, { status: 400 });
  }
  if (typeof firma_base64 !== "string" || firma_base64.length === 0) {
    return NextResponse.json({ error: "firma_base64 requerido" }, { status: 400 });
  }
  if (firma_base64.length > MAX_FIRMA_BASE64) {
    return NextResponse.json({ error: "Firma demasiado grande" }, { status: 400 });
  }
  if (typeof documento_hash_sha256 !== "string" || !HASH_HEX_RE.test(documento_hash_sha256)) {
    return NextResponse.json({ error: "documento_hash_sha256 inválido" }, { status: 400 });
  }

  // RLS ya filtra: una fila de otra organización simplemente no aparece.
  const { data: documento } = await supabase
    .from("documentos")
    .select("id, storage_path, licitacion_id")
    .eq("id", docId)
    .single();
  if (!documento) {
    return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });
  }

  let certInfo;
  try {
    certInfo = parseCertificado(cer_base64);
  } catch {
    return NextResponse.json({ error: "No se pudo leer el certificado (.cer)" }, { status: 400 });
  }
  if (!certInfo.vigente) {
    return NextResponse.json({ error: "El certificado no está vigente" }, { status: 400 });
  }
  if (!certPermiteFirmar(cer_base64)) {
    return NextResponse.json(
      { error: "El certificado no está autorizado para firmar (keyUsage no incluye digitalSignature)" },
      { status: 400 },
    );
  }

  const empresa = await getEmpresaPerfilActiva(supabase, perfil.organization_id, user.id, {
    fallbackToFirst: true,
  });
  const rfcCoincide =
    !empresa?.rfc || !certInfo.rfc ? null : normalizarRfc(empresa.rfc) === normalizarRfc(certInfo.rfc);
  if (rfcCoincide === false && confirmar_rfc_distinto !== true) {
    return NextResponse.json(
      {
        error: "rfc_distinto",
        detalle: `El RFC del certificado (${certInfo.rfc}) no coincide con el de la empresa activa (${empresa?.rfc}). Confirma explícitamente si esto es correcto.`,
      },
      { status: 400 },
    );
  }

  // Se descarga el documento del lado del servidor de forma independiente
  // (no se confía ciegamente en el hash que mandó el cliente) para
  // recalcular el hash y verificar la firma sobre el contenido real.
  const { data: archivo, error: downloadError } = await supabase.storage
    .from("documentos-originales")
    .download(documento.storage_path);
  if (downloadError || !archivo) {
    return NextResponse.json({ error: "No se pudo descargar el documento" }, { status: 500 });
  }
  const documentBytes = await archivo.arrayBuffer();

  const hashServidor = hashDocumentoHex(documentBytes);
  if (hashServidor !== documento_hash_sha256) {
    return NextResponse.json(
      { error: "El documento cambió entre que se calculó la firma y llegó al servidor" },
      { status: 409 },
    );
  }

  // Esta es la verificación central: prueba criptográficamente que
  // firma_base64 fue generada por la llave privada correspondiente a la
  // llave pública de cer_base64, sobre exactamente este documento. Nunca
  // se recibió ni se procesó la llave privada ni la contraseña.
  if (!verificarFirma(cer_base64, firma_base64, documentBytes)) {
    return NextResponse.json(
      { error: "La firma no es válida para este certificado y documento" },
      { status: 400 },
    );
  }

  const firmaDigitalJson = {
    tipo: "interna",
    algoritmo: "RSA-SHA256",
    firma_base64,
    documento_hash_sha256: hashServidor,
    certificado_base64: cer_base64,
    firmado_por: certInfo.nombre_comun,
    rfc: certInfo.rfc,
    numero_serie: certInfo.numero_serie,
    rfc_coincide_empresa: rfcCoincide,
    firmado_at: new Date().toISOString(),
    firmado_por_user_id: user.id,
    empresa_perfil_id: empresa?.id ?? null,
  };

  const { data, error } = await supabase
    .from("documentos")
    .update({ firma_digital_json: firmaDigitalJson })
    .eq("id", docId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { error: logError } = await supabase.from("actividad_log").insert({
    licitacion_id: data.licitacion_id,
    user_id: user.id,
    accion: "documento_firmado",
    metadata_json: { documento_id: docId, rfc: certInfo.rfc, rfc_coincide_empresa: rfcCoincide },
  });
  if (logError) {
    console.error("No se pudo registrar actividad_log para documento_firmado:", logError.message);
  }

  return NextResponse.json({ data });
}

/**
 * Verificación bajo demanda: re-descarga el documento actual, recalcula su
 * hash y re-verifica la firma guardada contra el contenido ACTUAL — si el
 * archivo cambió después de firmarse, la verificación falla aquí sin
 * necesidad de mantener un flag de invalidación que se pueda desincronizar.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ docId: string }> },
) {
  const { docId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { data: documento } = await supabase
    .from("documentos")
    .select("id, storage_path, firma_digital_json")
    .eq("id", docId)
    .single();
  if (!documento) {
    return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });
  }

  const firma = documento.firma_digital_json as
    | { certificado_base64?: string; firma_base64?: string; documento_hash_sha256?: string }
    | null;
  if (!firma?.certificado_base64 || !firma.firma_base64) {
    return NextResponse.json({ data: { firmado: false } });
  }

  const { data: archivo, error: downloadError } = await supabase.storage
    .from("documentos-originales")
    .download(documento.storage_path);
  if (downloadError || !archivo) {
    return NextResponse.json({ error: "No se pudo descargar el documento" }, { status: 500 });
  }
  const documentBytes = await archivo.arrayBuffer();
  const hashActual = hashDocumentoHex(documentBytes);

  const documentoSinCambios = hashActual === firma.documento_hash_sha256;
  const firmaValida = verificarFirma(firma.certificado_base64, firma.firma_base64, documentBytes);

  return NextResponse.json({
    data: {
      firmado: true,
      valida: documentoSinCambios && firmaValida,
      documento_sin_cambios: documentoSinCambios,
      firma_criptograficamente_valida: firmaValida,
    },
  });
}
