// P0.3 — unit tests for the e.firma crypto primitives (src/lib/efirma.ts).
// Generates synthetic self-signed RSA certs/keys with node-forge (never
// touches real SAT credentials) to verify: sign/verify round-trips, wrong
// password fails, tampered documents fail verification, a signature from
// an unrelated key/cert pair fails verification (this IS the "does the
// private key correspond to the certificate" check — a passing
// verification is mathematically proof of correspondence), and the hash
// helper is deterministic. Run: npx tsx tests/unit/efirma.test.mjs
import forge from "node-forge";
import { parseCertificado, firmarDocumento, verificarFirma, hashDocumentoHex, certPermiteFirmar } from "../../src/lib/efirma.ts";

function makeCertAndKey(rfc, password, expired = false) {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date(expired ? "2000-01-01" : Date.now());
  cert.validity.notAfter = new Date(expired ? "2001-01-01" : Date.now() + 365 * 24 * 3600 * 1000);
  const attrs = [{ name: "commonName", value: `TEST NAME / ${rfc} / CURP123` }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const cerBase64 = forge.util.encode64(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes());

  const pkcs8Asn1 = forge.pki.wrapRsaPrivateKey(forge.pki.privateKeyToAsn1(keys.privateKey));
  const encryptedAsn1 = forge.pki.encryptPrivateKeyInfo(pkcs8Asn1, password, { algorithm: "aes256" });
  const keyBase64 = forge.util.encode64(forge.asn1.toDer(encryptedAsn1).getBytes());
  return { cerBase64, keyBase64 };
}

let pass = 0, fail = 0;
function check(name, ok) {
  if (ok) { pass++; console.log("PASS", name); } else { fail++; console.log("FAIL", name); }
}

const { cerBase64, keyBase64 } = makeCertAndKey("AAAA010101AAA", "correct-pass");
const { cerBase64: cerBase64B, keyBase64: keyBase64B } = makeCertAndKey("BBBB020202BBB", "correct-pass");
const { cerBase64: cerExpired } = makeCertAndKey("CCCC030303CCC", "correct-pass", true);

const doc = new TextEncoder().encode("contenido del documento de prueba").buffer;
const docTampered = new TextEncoder().encode("contenido MODIFICADO del documento").buffer;

// 1. Cert parsing
const info = parseCertificado(cerBase64);
check("parseCertificado: vigente=true for fresh cert", info.vigente === true);
check("parseCertificado: extracts RFC", info.rfc === "AAAA010101AAA");

const infoExpired = parseCertificado(cerExpired);
check("parseCertificado: vigente=false for expired cert", infoExpired.vigente === false);

// 2. Sign + verify happy path
const firma = firmarDocumento(keyBase64, "correct-pass", doc);
check("verificarFirma: valid signature verifies true", verificarFirma(cerBase64, firma, doc) === true);

// 3. Wrong password
let wrongPassThrew = false;
try { firmarDocumento(keyBase64, "wrong-pass", doc); } catch { wrongPassThrew = true; }
check("firmarDocumento: wrong password throws", wrongPassThrew);

// 4. Document tampered after signing
check("verificarFirma: tampered document fails verification", verificarFirma(cerBase64, firma, docTampered) === false);

// 5. Signature from a DIFFERENT cert/key pair (key doesn't correspond to cert)
const firmaB = firmarDocumento(keyBase64B, "correct-pass", doc);
check("verificarFirma: signature from unrelated key/cert fails against cert A", verificarFirma(cerBase64, firmaB, doc) === false);
check("verificarFirma: signature from unrelated key/cert fails against cert B mismatched doc", verificarFirma(cerBase64B, firma, doc) === false);

// 6. Hash helper
const h1 = hashDocumentoHex(doc);
const h2 = hashDocumentoHex(doc);
const h3 = hashDocumentoHex(docTampered);
check("hashDocumentoHex: deterministic", h1 === h2);
check("hashDocumentoHex: different content -> different hash", h1 !== h3);
check("hashDocumentoHex: looks like sha256 hex (64 chars)", /^[0-9a-f]{64}$/.test(h1));

// 7. certPermiteFirmar (no keyUsage extension set in our test certs -> permissive true)
check("certPermiteFirmar: permissive when no keyUsage extension", certPermiteFirmar(cerBase64) === true);

// 8. Garbage input handling
check("verificarFirma: garbage cer returns false, not throw", verificarFirma("not-base64-cert!!!", firma, doc) === false);
check("verificarFirma: garbage firma returns false, not throw", verificarFirma(cerBase64, "not-a-signature", doc) === false);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
