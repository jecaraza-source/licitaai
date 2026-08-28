// P0.3 — integration tests for the "firma interna de integridad" flow
// (/api/documentos/[docId]/firmar). Runs against the local dev server +
// local Supabase stack; logs in via the real UI so requests carry a real
// session cookie in the exact format the app itself produces, then drives
// the API directly via Playwright's `page.request` (shares cookies with
// the logged-in page).
//
// Usage:
//   npx supabase start
//   npm run dev            (separate terminal, or let webServer in
//                            playwright.config.ts start it)
//   npx playwright test tests/integration/p0-efirma.spec.ts
import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import forge from "node-forge";
import { firmarDocumento, hashDocumentoHex } from "../../src/lib/efirma";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";

test.skip(
  SUPABASE_URL.includes("supabase.co"),
  "Refusing to run against a hosted/remote project — local only.",
);

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

function rnd() {
  return Math.random().toString(36).slice(2, 10);
}

function makeCertAndKey(rfc: string, password: string, expired = false) {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date(expired ? "2000-01-01" : Date.now());
  cert.validity.notAfter = new Date(
    expired ? "2001-01-01" : Date.now() + 365 * 24 * 3600 * 1000,
  );
  const attrs = [{ name: "commonName", value: `TEST NAME / ${rfc} / CURP123` }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const cerBase64 = forge.util.encode64(
    forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes(),
  );

  const pkcs8Asn1 = forge.pki.wrapRsaPrivateKey(forge.pki.privateKeyToAsn1(keys.privateKey));
  const encryptedAsn1 = forge.pki.encryptPrivateKeyInfo(pkcs8Asn1, password, {
    algorithm: "aes256",
  });
  const keyBase64 = forge.util.encode64(forge.asn1.toDer(encryptedAsn1).getBytes());
  return { cerBase64, keyBase64 };
}

async function makeOrgWithUser(rol: "ADMIN" | "VIEWER" = "ADMIN") {
  const { data: org } = await admin
    .from("organizations")
    .insert({ nombre: `Org ${rnd()}` })
    .select("id")
    .single();
  const { data: ticket } = await admin
    .from("signup_tickets")
    .insert({ organization_id: org!.id })
    .select("id")
    .single();
  const email = `u-${rnd()}@example.org`;
  const password = "TestPassword123!";
  const { data: userData, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nombre: "Test User", signup_ticket: ticket!.id },
  });
  if (error) throw error;
  if (rol !== "ADMIN") {
    await admin.from("users").update({ rol }).eq("id", userData.user!.id);
  }
  return { orgId: org!.id as string, userId: userData.user!.id, email, password };
}

async function makeLicitacionYDocumento(orgId: string, contenido: string) {
  const { data: lic } = await admin
    .from("licitaciones")
    .insert({
      organization_id: orgId,
      numero_expediente: `EXP-${rnd()}`,
      titulo: "Licitación de prueba",
      institucion: "Institución de prueba",
      tipo: "SERVICIOS",
      estado_id: "FEDERAL",
      sistema: "COMPRANET",
    })
    .select("id")
    .single();

  const storagePath = `${orgId}/${lic!.id}/documento-${rnd()}.pdf`;
  const bytes = new TextEncoder().encode(contenido);
  const { error: uploadError } = await admin.storage
    .from("documentos-originales")
    .upload(storagePath, bytes, { contentType: "application/pdf" });
  if (uploadError) throw uploadError;

  const { data: doc } = await admin
    .from("documentos")
    .insert({
      licitacion_id: lic!.id,
      tipo_documento: "OTRO",
      nombre: "documento.pdf",
      storage_path: storagePath,
    })
    .select("id")
    .single();

  return { licitacionId: lic!.id as string, documentoId: doc!.id as string, storagePath, bytes };
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  // Login siempre limpia la empresa activa y puede redirigir a
  // /seleccionar-empresa en vez de /dashboard directamente — para estas
  // pruebas basta con que la sesión (cookie) quede establecida, sin
  // importar en cuál de las dos páginas termine.
  await page.waitForURL(/\/(dashboard|seleccionar-empresa)/);
}

test.describe("P0.3 — firma interna de integridad", () => {
  test("certificado y llave correspondientes: firma válida es aceptada", async ({ page }) => {
    const org = await makeOrgWithUser("ADMIN");
    await admin.from("empresa_perfil").insert({ organization_id: org.orgId, rfc: "AAAA010101AAA" });
    const { documentoId, bytes } = await makeLicitacionYDocumento(org.orgId, "contenido A");
    const { cerBase64, keyBase64 } = makeCertAndKey("AAAA010101AAA", "pass1234");

    await login(page, org.email, org.password);

    const documentBytes = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const firma_base64 = firmarDocumento(keyBase64, "pass1234", documentBytes);
    const documento_hash_sha256 = hashDocumentoHex(documentBytes);

    const res = await page.request.post(`/api/documentos/${documentoId}/firmar`, {
      data: { cer_base64: cerBase64, firma_base64, documento_hash_sha256 },
    });
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.data.firma_digital_json.rfc).toBe("AAAA010101AAA");
    expect(json.data.firma_digital_json.rfc_coincide_empresa).toBe(true);

    // Verificación bajo demanda: debe reportarse válida.
    const verify = await page.request.get(`/api/documentos/${documentoId}/firmar`);
    expect(verify.status()).toBe(200);
    const verifyJson = await verify.json();
    expect(verifyJson.data.valida).toBe(true);
  });

  test("firma generada con una llave que NO corresponde al certificado es rechazada", async ({
    page,
  }) => {
    const org = await makeOrgWithUser("ADMIN");
    const { documentoId, bytes } = await makeLicitacionYDocumento(org.orgId, "contenido B");
    const { cerBase64 } = makeCertAndKey("BBBB020202BBB", "pass1234");
    const { keyBase64: keyBase64Otra } = makeCertAndKey("CCCC030303CCC", "pass1234");

    await login(page, org.email, org.password);

    const documentBytes = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    // Firma generada con una llave de OTRO par cert/key — no debe verificar
    // contra cerBase64.
    const firma_base64 = firmarDocumento(keyBase64Otra, "pass1234", documentBytes);
    const documento_hash_sha256 = hashDocumentoHex(documentBytes);

    const res = await page.request.post(`/api/documentos/${documentoId}/firmar`, {
      data: { cer_base64: cerBase64, firma_base64, documento_hash_sha256 },
    });
    expect(res.status()).toBe(400);
  });

  test("certificado vencido es rechazado", async ({ page }) => {
    const org = await makeOrgWithUser("ADMIN");
    const { documentoId, bytes } = await makeLicitacionYDocumento(org.orgId, "contenido C");
    const { cerBase64, keyBase64 } = makeCertAndKey("DDDD040404DDD", "pass1234", true);

    await login(page, org.email, org.password);

    const documentBytes = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const firma_base64 = firmarDocumento(keyBase64, "pass1234", documentBytes);
    const documento_hash_sha256 = hashDocumentoHex(documentBytes);

    const res = await page.request.post(`/api/documentos/${documentoId}/firmar`, {
      data: { cer_base64: cerBase64, firma_base64, documento_hash_sha256 },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error.message).toContain("vigente");
  });

  test("RFC del certificado distinto al de la empresa activa requiere confirmación explícita", async ({
    page,
  }) => {
    const org = await makeOrgWithUser("ADMIN");
    await admin.from("empresa_perfil").insert({ organization_id: org.orgId, rfc: "EEEE050505EEE" });
    const { documentoId, bytes } = await makeLicitacionYDocumento(org.orgId, "contenido D");
    const { cerBase64, keyBase64 } = makeCertAndKey("FFFF060606FFF", "pass1234");

    await login(page, org.email, org.password);

    const documentBytes = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const firma_base64 = firmarDocumento(keyBase64, "pass1234", documentBytes);
    const documento_hash_sha256 = hashDocumentoHex(documentBytes);

    const sinConfirmar = await page.request.post(`/api/documentos/${documentoId}/firmar`, {
      data: { cer_base64: cerBase64, firma_base64, documento_hash_sha256 },
    });
    expect(sinConfirmar.status()).toBe(400);
    expect((await sinConfirmar.json()).error.details.motivo).toBe("rfc_distinto");

    const conConfirmacion = await page.request.post(`/api/documentos/${documentoId}/firmar`, {
      data: {
        cer_base64: cerBase64,
        firma_base64,
        documento_hash_sha256,
        confirmar_rfc_distinto: true,
      },
    });
    expect(conConfirmacion.status()).toBe(200);
  });

  test("documento modificado después de firmarse: la verificación posterior falla", async ({
    page,
  }) => {
    const org = await makeOrgWithUser("ADMIN");
    const { documentoId, storagePath, bytes } = await makeLicitacionYDocumento(org.orgId, "contenido E");
    const { cerBase64, keyBase64 } = makeCertAndKey("GGGG070707GGG", "pass1234");

    await login(page, org.email, org.password);

    const documentBytes = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const firma_base64 = firmarDocumento(keyBase64, "pass1234", documentBytes);
    const documento_hash_sha256 = hashDocumentoHex(documentBytes);

    const firmar = await page.request.post(`/api/documentos/${documentoId}/firmar`, {
      data: { cer_base64: cerBase64, firma_base64, documento_hash_sha256 },
    });
    expect(firmar.status()).toBe(200);

    // El archivo se reemplaza en Storage después de firmarse.
    await admin.storage
      .from("documentos-originales")
      .upload(storagePath, new TextEncoder().encode("contenido E MODIFICADO"), {
        upsert: true,
        contentType: "application/pdf",
      });

    const verify = await page.request.get(`/api/documentos/${documentoId}/firmar`);
    expect(verify.status()).toBe(200);
    const verifyJson = await verify.json();
    expect(verifyJson.data.valida).toBe(false);
    expect(verifyJson.data.documento_sin_cambios).toBe(false);
  });

  test("usuario de otra organización no puede firmar ni ver el documento", async ({ page }) => {
    const orgA = await makeOrgWithUser("ADMIN");
    const orgB = await makeOrgWithUser("ADMIN");
    const { documentoId, bytes } = await makeLicitacionYDocumento(orgA.orgId, "contenido F");
    const { cerBase64, keyBase64 } = makeCertAndKey("HHHH080808HHH", "pass1234");

    await login(page, orgB.email, orgB.password);

    const documentBytes = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const firma_base64 = firmarDocumento(keyBase64, "pass1234", documentBytes);
    const documento_hash_sha256 = hashDocumentoHex(documentBytes);

    const res = await page.request.post(`/api/documentos/${documentoId}/firmar`, {
      data: { cer_base64: cerBase64, firma_base64, documento_hash_sha256 },
    });
    expect(res.status()).toBe(404);
  });

  test("un usuario VIEWER no puede firmar", async ({ page }) => {
    const org = await makeOrgWithUser("ADMIN");
    const viewer = await makeOrgWithUser("VIEWER");
    await admin.from("users").update({ organization_id: org.orgId, rol: "VIEWER" }).eq("id", viewer.userId);

    const { documentoId, bytes } = await makeLicitacionYDocumento(org.orgId, "contenido G");
    const { cerBase64, keyBase64 } = makeCertAndKey("IIII090909III", "pass1234");

    await login(page, viewer.email, viewer.password);

    const documentBytes = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const firma_base64 = firmarDocumento(keyBase64, "pass1234", documentBytes);
    const documento_hash_sha256 = hashDocumentoHex(documentBytes);

    const res = await page.request.post(`/api/documentos/${documentoId}/firmar`, {
      data: { cer_base64: cerBase64, firma_base64, documento_hash_sha256 },
    });
    expect(res.status()).toBe(403);
  });

  test("payload sin llave privada ni contraseña: la ruta nunca los acepta como campos válidos", async ({
    page,
  }) => {
    const org = await makeOrgWithUser("ADMIN");
    const { documentoId } = await makeLicitacionYDocumento(org.orgId, "contenido H");
    await login(page, org.email, org.password);

    // Enviar key_base64/password (formato viejo) ya no es un payload válido
    // — la ruta los ignora por completo y falla en la validación normal de
    // cer_base64/firma_base64/documento_hash_sha256.
    const res = await page.request.post(`/api/documentos/${documentoId}/firmar`, {
      data: { key_base64: "fake-key", password: "fake-password" },
    });
    expect(res.status()).toBe(400);
  });
});
