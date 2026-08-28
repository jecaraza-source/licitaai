// P0.5 — integration tests for storage-level defenses: the
// allowed_mime_types allowlist (migration 20260826220000) and the
// magic-byte content check inside procesar-documento (which actually
// downloads and inspects the file server-side, catching a spoofed
// Content-Type that the storage allowlist alone can't).
//
// Usage:
//   npx supabase start
//   node tests/integration/p0-storage-security.test.mjs
import { createClient } from "@supabase/supabase-js";
import { LOCAL } from "../helpers/local-supabase.mjs";

const URL = process.env.SUPABASE_URL ?? LOCAL.url;
const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? LOCAL.anonKey;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? LOCAL.serviceRoleKey;
const FUNCTIONS_URL = `${URL}/functions/v1`;

if (URL.includes("supabase.co")) {
  console.error("Refusing to run: SUPABASE_URL looks like a hosted/remote project, not local.");
  process.exit(1);
}

const admin = createClient(URL, SERVICE_KEY);

let pass = 0;
let fail = 0;
function check(name, ok, detail) {
  if (ok) {
    pass++;
    console.log(`PASS  ${name}`);
  } else {
    fail++;
    console.log(`FAIL  ${name}${detail ? " — " + detail : ""}`);
  }
}

function rnd() {
  return Math.random().toString(36).slice(2, 10);
}

async function main() {
  // -----------------------------------------------------------------------
  // 1. Storage-level allowlist: a disallowed Content-Type is rejected by
  //    Storage itself, before any application code even runs.
  // -----------------------------------------------------------------------
  {
    const { error } = await admin.storage
      .from("documentos-requeridos")
      .upload(`test-${rnd()}/test/malicious-${rnd()}.exe`, new Uint8Array([0x4d, 0x5a]), {
        contentType: "application/x-msdownload",
      });
    check("1. disallowed Content-Type rejected by storage.buckets.allowed_mime_types", !!error, error ? undefined : "upload succeeded — allowlist not enforced!");
  }
  {
    const { error } = await admin.storage
      .from("documentos-requeridos")
      .upload(`test-${rnd()}/test/valid-${rnd()}.pdf`, new TextEncoder().encode("%PDF-1.4 fake"), {
        contentType: "application/pdf",
      });
    check("2. allowed Content-Type is accepted", !error, error?.message);
  }
  {
    // documentos-corporativos allows pdf/jpeg/png, not arbitrary types.
    const { error } = await admin.storage
      .from("documentos-corporativos")
      .upload(`test-${rnd()}/malicious-${rnd()}.html`, new Uint8Array([0x3c, 0x68]), {
        contentType: "text/html",
      });
    check("3. documentos-corporativos rejects a disallowed Content-Type (text/html)", !!error, error ? undefined : "upload succeeded!");
  }

  // -----------------------------------------------------------------------
  // 2. Magic-byte check inside procesar-documento: a file whose CONTENT
  //    doesn't match its claimed .pdf extension is rejected, even though
  //    it was uploaded with a spoofed but allowlisted Content-Type
  //    (application/pdf) — this is exactly what the storage allowlist
  //    alone cannot catch, since it only checks the declared header.
  // -----------------------------------------------------------------------
  {
    const { data: org } = await admin.from("organizations").insert({ nombre: `Org ${rnd()}` }).select("id").single();
    const { data: ticket } = await admin.from("signup_tickets").insert({ organization_id: org.id }).select("id").single();
    const email = `u-${rnd()}@example.org`;
    const { error: userError } = await admin.auth.admin.createUser({
      email,
      password: "TestPassword123!",
      email_confirm: true,
      user_metadata: { nombre: "Test", signup_ticket: ticket.id },
    });
    if (userError) throw userError;

    const { data: lic } = await admin
      .from("licitaciones")
      .insert({
        organization_id: org.id,
        numero_expediente: `EXP-${rnd()}`,
        titulo: "Licitación de prueba",
        institucion: "Institución",
        tipo: "SERVICIOS",
        estado_id: "FEDERAL",
        sistema: "COMPRANET",
      })
      .select("id")
      .single();

    const path = `${org.id}/${lic.id}/spoofed-${rnd()}.pdf`;
    // Uploaded with a spoofed Content-Type: application/pdf, but the
    // actual bytes are not a PDF at all — the storage allowlist accepts
    // this (the header matches), only content inspection catches it.
    await admin.storage.from("documentos-originales").upload(path, new TextEncoder().encode("not actually a pdf"), {
      contentType: "application/pdf",
    });
    const { data: doc } = await admin
      .from("documentos")
      .insert({ licitacion_id: lic.id, tipo_documento: "OTRO", nombre: "spoofed.pdf", storage_path: path })
      .select("id")
      .single();

    const anon = createClient(URL, ANON_KEY);
    const { data: session } = await anon.auth.signInWithPassword({ email, password: "TestPassword123!" });

    const res = await fetch(`${FUNCTIONS_URL}/procesar-documento`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.session.access_token}` },
      body: JSON.stringify({ documento_id: doc.id }),
    });
    check("4. procesar-documento rejects content that doesn't match its .pdf extension", res.status === 422, `got ${res.status}`);

    const { data: docAfter } = await admin.from("documentos").select("procesado").eq("id", doc.id).single();
    check("5. the spoofed document is left unprocessed (procesado = false)", docAfter.procesado === false);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
