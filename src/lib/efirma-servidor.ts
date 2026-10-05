import { createPublicKey, createVerify, X509Certificate } from "node:crypto";

// Verificación de firmas e.firma en el servidor con node:crypto (OpenSSL).
// Antes se hacía con node-forge, cuya verificación RSA PKCS#1 v1.5 acepta
// DigestInfo con elementos extra (GHSA-86w9-cpqp-85rv, sin fix publicado).
// OpenSSL compara el DigestInfo completo y estricto. Solo Node: no importar
// desde componentes de cliente (la firma se genera en el navegador con
// efirma.ts).

/**
 * Verifica criptográficamente que `firmaBase64` sea una firma RSA-SHA256
 * válida de `documentBytes`, generada por la llave privada correspondiente
 * a la llave pública de `cerBase64`. Esto es lo que realmente prueba que
 * "la llave privada corresponde al certificado" — si la verificación pasa,
 * matemáticamente no puede haberse generado con otra llave.
 */
export function verificarFirma(
  cerBase64: string,
  firmaBase64: string,
  documentBytes: ArrayBuffer,
): boolean {
  try {
    const cert = new X509Certificate(Buffer.from(cerBase64, "base64"));
    const publicKey = createPublicKey(cert.publicKey.export({ type: "spki", format: "pem" }));
    if (publicKey.asymmetricKeyType !== "rsa") return false;

    const verifier = createVerify("RSA-SHA256");
    verifier.update(Buffer.from(documentBytes));
    return verifier.verify(publicKey, Buffer.from(firmaBase64, "base64"));
  } catch {
    return false;
  }
}
