import forge from "node-forge";

export interface CertificadoInfo {
  vigente: boolean;
  fecha_inicio: string;
  fecha_fin: string;
  nombre_comun: string | null;
  rfc: string | null;
  numero_serie: string | null;
}

/**
 * Analiza un certificado .cer del SAT (X.509, DER, codificado en base64).
 * Solo lee datos públicos del certificado — nunca requiere la llave privada.
 */
export function parseCertificado(cerBase64: string): CertificadoInfo {
  const der = forge.util.decode64(cerBase64);
  const asn1 = forge.asn1.fromDer(der);
  const cert = forge.pki.certificateFromAsn1(asn1);

  const ahora = new Date();
  const vigente = ahora >= cert.validity.notBefore && ahora <= cert.validity.notAfter;

  const cn = cert.subject.getField("CN");
  // El RFC del SAT normalmente viene en el subject como "SERIALNUMBER" o
  // codificado dentro del CN (formato "NOMBRE / RFC / CURP").
  const serialField = cert.subject.getField({ shortName: "serialNumber" });
  const rfcMatch = cn?.value?.match(/([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})/);

  return {
    vigente,
    fecha_inicio: cert.validity.notBefore.toISOString(),
    fecha_fin: cert.validity.notAfter.toISOString(),
    nombre_comun: cn?.value ?? null,
    rfc: serialField?.value ?? rfcMatch?.[1] ?? null,
    numero_serie: cert.serialNumber || null,
  };
}

/**
 * Firma el documento (bytes) con la llave privada del .key del SAT, usando
 * RSA-SHA256 / PKCS#1 v1.5 (el patrón estándar de node-forge: se construye
 * el digest y forge arma internamente el DigestInfo con el OID correcto).
 *
 * Nota importante: esto produce una firma criptográfica real sobre el
 * documento, útil como mecanismo de integridad y trazabilidad interna
 * ("firmado digitalmente" dentro de LicitaAI). NO es una firma PAdES ni un
 * sello reconocido oficialmente por el SAT para trámites — eso requiere el
 * formato específico que define el SAT para cada tipo de trámite.
 */
export function firmarDocumento(
  keyBase64: string,
  password: string,
  documentBytes: ArrayBuffer,
): string {
  const der = forge.util.decode64(keyBase64);
  const asn1 = forge.asn1.fromDer(der);
  const privateKeyInfo = forge.pki.decryptPrivateKeyInfo(asn1, password);
  if (!privateKeyInfo) {
    throw new Error("Contraseña incorrecta o formato de llave no soportado");
  }
  const privateKey = forge.pki.privateKeyFromAsn1(privateKeyInfo) as forge.pki.rsa.PrivateKey;

  const md = forge.md.sha256.create();
  md.update(forge.util.createBuffer(documentBytes).getBytes());

  const signature = privateKey.sign(md);
  return forge.util.encode64(signature);
}
