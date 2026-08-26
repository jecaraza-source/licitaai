// P0.2 — cross-tenant isolation tests for Edge Functions.
//
// Verifies the shared authorization module (supabase/functions/_shared/auth.ts)
// actually gates every Edge Function: no Authorization header -> 401,
// a resource belonging to a different organization -> 404 (never revealed),
// VIEWER attempting a write/AI operation -> 403.
//
// These test the AUTHORIZATION LAYER specifically, which runs and rejects
// BEFORE any Anthropic/OpenAI call — so they work without live AI API keys
// (ANTHROPIC_API_KEY/OPENAI_API_KEY empty is fine for every case here
// except the deliberately-not-run "full happy path produces output" case,
// which is out of scope for this suite).
//
// Usage:
//   npx supabase start
//   node tests/integration/p0-edge-functions-isolation.test.mjs
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";
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

async function invoke(fn, body, token) {
  const res = await fetch(`${FUNCTIONS_URL}/${fn}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return res;
}

async function makeOrgWithUser(rol = "ADMIN") {
  const { data: org } = await admin.from("organizations").insert({ nombre: `Org ${rnd()}` }).select("id").single();
  const { data: ticket } = await admin.from("signup_tickets").insert({ organization_id: org.id }).select("id").single();
  const email = `u-${rnd()}@example.org`;
  const { data: userData, error } = await admin.auth.admin.createUser({
    email,
    password: "TestPassword123!",
    email_confirm: true,
    user_metadata: { nombre: "Test User", signup_ticket: ticket.id },
  });
  if (error) throw error;
  if (rol !== "ADMIN") {
    await admin.from("users").update({ rol }).eq("id", userData.user.id);
  }
  const anon = createClient(URL, ANON_KEY);
  const { data: session } = await anon.auth.signInWithPassword({ email, password: "TestPassword123!" });
  return { orgId: org.id, userId: userData.user.id, token: session.session.access_token };
}

async function main() {
  const orgA = await makeOrgWithUser("ADMIN");
  const orgAViewer = await makeOrgWithUser("VIEWER");
  // orgAViewer is its own org; move its user into orgA so we have a real
  // VIEWER teammate inside orgA specifically.
  await admin.from("users").update({ organization_id: orgA.orgId, rol: "VIEWER" }).eq("id", orgAViewer.userId);
  const orgB = await makeOrgWithUser("ADMIN");

  // Licitación in org B (the "foreign" resource org A must never touch).
  const { data: licB } = await admin
    .from("licitaciones")
    .insert({
      organization_id: orgB.orgId,
      numero_expediente: `EXP-${rnd()}`,
      titulo: "Licitación B",
      institucion: "Institución B",
      tipo: "SERVICIOS",
      estado_id: "FEDERAL",
      sistema: "COMPRANET",
    })
    .select("id")
    .single();

  // Licitación in org A (used for the VIEWER-write-rejected + "passes auth" cases).
  const { data: licA } = await admin
    .from("licitaciones")
    .insert({
      organization_id: orgA.orgId,
      numero_expediente: `EXP-${rnd()}`,
      titulo: "Licitación A",
      institucion: "Institución A",
      tipo: "SERVICIOS",
      estado_id: "FEDERAL",
      sistema: "COMPRANET",
    })
    .select("id")
    .single();

  const { data: docB } = await admin
    .from("documentos")
    .insert({ licitacion_id: licB.id, tipo_documento: "OTRO", nombre: "b.pdf", storage_path: "x/b.pdf" })
    .select("id")
    .single();
  const { data: docA } = await admin
    .from("documentos")
    .insert({ licitacion_id: licA.id, tipo_documento: "OTRO", nombre: "a.pdf", storage_path: "x/a.pdf" })
    .select("id")
    .single();

  const { data: checklistB } = await admin
    .from("checklist_items")
    .insert({ licitacion_id: licB.id, categoria: "LEGAL", descripcion: "Requisito B" })
    .select("id")
    .single();
  const { data: checklistA } = await admin
    .from("checklist_items")
    .insert({ licitacion_id: licA.id, categoria: "LEGAL", descripcion: "Requisito A" })
    .select("id")
    .single();

  const { data: empresaB } = await admin
    .from("empresa_perfil")
    .insert({ organization_id: orgB.orgId, razon_social: "Empresa B" })
    .select("id")
    .single();
  const { data: docCorpB } = await admin
    .from("documentos_corporativos")
    .insert({ empresa_perfil_id: empresaB.id, organization_id: orgB.orgId, tipo: "Acta constitutiva", nombre: "acta.pdf", storage_path: "x/acta.pdf" })
    .select("id")
    .single();
  const { data: empresaA } = await admin
    .from("empresa_perfil")
    .insert({ organization_id: orgA.orgId, razon_social: "Empresa A" })
    .select("id")
    .single();
  const { data: docCorpA } = await admin
    .from("documentos_corporativos")
    .insert({ empresa_perfil_id: empresaA.id, organization_id: orgA.orgId, tipo: "Acta constitutiva", nombre: "acta.pdf", storage_path: "x/acta.pdf" })
    .select("id")
    .single();

  const { data: referencia } = await admin.from("referencias_legales").select("id").limit(1).single();
  const { data: refDoc } = await admin
    .from("referencia_legal_documentos")
    .insert({ referencia_legal_id: referencia.id, nombre: `test-${rnd()}.pdf`, storage_path: `x/${rnd()}.pdf` })
    .select("id")
    .single();

  // -----------------------------------------------------------------------
  // Table-driven checks per function.
  // -----------------------------------------------------------------------
  const cases = [
    {
      fn: "analizar-bases",
      foreign: { licitacion_id: licB.id },
      sameOrg: { licitacion_id: licA.id },
    },
    {
      fn: "procesar-documento",
      foreign: { documento_id: docB.id },
      sameOrg: { documento_id: docA.id },
    },
    {
      fn: "auditar-documento",
      foreign: { documento_id: docB.id, checklist_item_id: checklistB.id },
      sameOrg: { documento_id: docA.id, checklist_item_id: checklistA.id },
    },
    {
      fn: "auditar-expediente",
      foreign: { licitacion_id: licB.id },
      sameOrg: { licitacion_id: licA.id },
    },
    {
      fn: "generar-estudio-mercado",
      foreign: { licitacion_id: licB.id },
      sameOrg: { licitacion_id: licA.id },
    },
    {
      fn: "generar-preguntas-junta",
      foreign: { licitacion_id: licB.id },
      sameOrg: { licitacion_id: licA.id },
    },
    {
      fn: "generar-propuesta-tecnica",
      foreign: { licitacion_id: licB.id },
      sameOrg: { licitacion_id: licA.id },
    },
    {
      fn: "analizar-documento-corporativo",
      foreign: { documento_id: docCorpB.id },
      sameOrg: { documento_id: docCorpA.id },
    },
  ];

  for (const c of cases) {
    const unauthRes = await invoke(c.fn, c.foreign, null);
    check(`${c.fn}: no Authorization header -> 401`, unauthRes.status === 401, `got ${unauthRes.status}`);

    const crossRes = await invoke(c.fn, c.foreign, orgA.token);
    check(`${c.fn}: org A token against org B's resource -> 404 (not revealed)`, crossRes.status === 404, `got ${crossRes.status}`);

    const viewerRes = await invoke(c.fn, c.sameOrg, orgAViewer.token);
    check(`${c.fn}: VIEWER rejected -> 403`, viewerRes.status === 403, `got ${viewerRes.status}`);

    // Positive: same-org ADMIN gets PAST authorization (may still fail later
    // for unrelated reasons — no AI keys locally, no data to analyze — but
    // must not be 401/403/404).
    const okOrgRes = await invoke(c.fn, c.sameOrg, orgA.token);
    check(
      `${c.fn}: same-org ADMIN passes authorization (not 401/403/404)`,
      ![401, 403, 404].includes(okOrgRes.status),
      `got ${okOrgRes.status}`,
    );
  }

  // -----------------------------------------------------------------------
  // procesar-referencia-legal: global content, ADMIN-only (not org-scoped,
  // but must still reject unauthenticated and non-ADMIN callers).
  // -----------------------------------------------------------------------
  {
    const unauthRes = await invoke("procesar-referencia-legal", { referencia_documento_id: refDoc.id }, null);
    check("procesar-referencia-legal: no auth -> 401", unauthRes.status === 401, `got ${unauthRes.status}`);

    const viewerRes = await invoke("procesar-referencia-legal", { referencia_documento_id: refDoc.id }, orgAViewer.token);
    check("procesar-referencia-legal: VIEWER rejected -> 403", viewerRes.status === 403, `got ${viewerRes.status}`);

    // orgB is ADMIN of ITS org, but referencias_legales is global — this
    // function should still reject any non-platform-ADMIN... in this app
    // ADMIN means "org admin", so an org ADMIN from org B IS accepted by
    // the rol check (there's no separate "platform admin" concept here);
    // what matters is that a VIEWER/ANALYST/MANAGER cannot, and that it's
    // never reachable without authentication at all. Confirmed above.
    const adminRes = await invoke("procesar-referencia-legal", { referencia_documento_id: refDoc.id }, orgB.token);
    check(
      "procesar-referencia-legal: an org ADMIN passes authorization (not 401/403)",
      ![401, 403].includes(adminRes.status),
      `got ${adminRes.status}`,
    );
  }

  // -----------------------------------------------------------------------
  // Rate limit still applies on direct invocation (can't be evaded by
  // bypassing the Next.js layer). generar-propuesta-tecnica is capped at
  // 5/min in this deployment.
  // -----------------------------------------------------------------------
  {
    const org = await makeOrgWithUser("ADMIN");
    const { data: lic } = await admin
      .from("licitaciones")
      .insert({
        organization_id: org.orgId,
        numero_expediente: `EXP-${rnd()}`,
        titulo: "Rate limit test",
        institucion: "Inst",
        tipo: "SERVICIOS",
        estado_id: "FEDERAL",
        sistema: "COMPRANET",
      })
      .select("id")
      .single();

    let sawRateLimited = false;
    for (let i = 0; i < 7; i++) {
      const res = await invoke("generar-propuesta-tecnica", { licitacion_id: lic.id }, org.token);
      if (res.status === 429) {
        sawRateLimited = true;
        break;
      }
    }
    check("generar-propuesta-tecnica: direct invocation still hits rate limit (429 within 7 calls)", sawRateLimited);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
