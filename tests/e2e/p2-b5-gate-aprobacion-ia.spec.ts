// P2 · B5 (D5) — gate duro de aprobación de IA en el paso a ENVIADA.
//
//   npx supabase start
//   npx playwright test tests/e2e/p2-b5-gate-aprobacion-ia.spec.ts
import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { LOCAL } from "../helpers/local-supabase.mjs";

const SUPABASE_URL = process.env.SUPABASE_URL ?? LOCAL.url;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? LOCAL.serviceRoleKey;

test.skip(SUPABASE_URL.includes("supabase.co"), "local only");

const admin = createClient(SUPABASE_URL, SERVICE_KEY);
const rnd = () => Math.random().toString(36).slice(2, 10);

const ITEMS_LIBERACION = [
  "documentos_descargados", "convocatoria_revisada", "anexo_tecnico_revisado",
  "terminos_condiciones_revisados", "formatos_revisados", "aclaraciones_incorporadas",
  "legal_administrativo_integrado", "tecnico_acreditado", "economica_integrada",
  "textos_obligatorios", "firmas_completas", "archivos_legibles", "revision_independiente",
  "compras_mx_capturado", "version_respaldada",
];

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/(dashboard|seleccionar-empresa)/);
}

async function setup(rol: "ADMIN" | "MANAGER" = "ADMIN") {
  const { data: org } = await admin.from("organizations").insert({ nombre: `Org ${rnd()}` }).select("id").single();
  const { data: ticket } = await admin.from("signup_tickets").insert({ organization_id: org!.id }).select("id").single();
  const email = `u-${rnd()}@example.org`;
  const password = "TestPassword123!";
  const { data: u } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { nombre: "Test", signup_ticket: ticket!.id },
  });
  if (rol !== "ADMIN") await admin.from("users").update({ rol }).eq("id", u!.user!.id);

  const { data: lic } = await admin.from("licitaciones").insert({
    organization_id: org!.id, numero_expediente: `EXP-${rnd()}`, titulo: "L", institucion: "I",
    tipo: "SERVICIOS", estado_id: "FEDERAL", sistema: "COMPRANET", estado_licitacion: "PREPARACION",
  }).select("id").single();

  // El gate base (rojos/amarillos/liberación/supervisor) se deja satisfecho
  // para poder ejercer específicamente el gate de IA.
  await admin.from("checklist_liberacion").insert({
    licitacion_id: lic!.id,
    items_json: ITEMS_LIBERACION.map((id) => ({ id, checked: true })),
  });
  await admin.from("licitacion_jerarquia").insert({
    licitacion_id: lic!.id, supervisor_id: u!.user!.id,
    supervisor_autorizado_at: new Date().toISOString(),
  });

  return { orgId: org!.id as string, userId: u!.user!.id as string, email, password, licId: lic!.id as string };
}

// Aditivo: cada test scopea el flag a SU organización sin pisar a las
// demás (el flag es una fila única). El describe corre en serie para
// evitar carreras de read-modify-write sobre esa fila.
async function setFlag(orgId: string, on: boolean) {
  const { data } = await admin
    .from("feature_flags")
    .select("orgs_incluidas")
    .eq("key", "ai.gate_aprobacion")
    .single();
  const set = new Set<string>(data?.orgs_incluidas ?? []);
  if (on) set.add(orgId);
  else set.delete(orgId);
  await admin
    .from("feature_flags")
    .update({ enabled: false, orgs_incluidas: [...set] })
    .eq("key", "ai.gate_aprobacion");
  // El servidor cachea los flags 3 s (src/lib/flags.ts TTL_MS).
  await new Promise((r) => setTimeout(r, 3300));
}

async function resultadoPendiente(orgId: string, licId: string) {
  await admin.from("ai_results").insert({
    organization_id: orgId, recurso_tipo: "licitacion", recurso_id: licId,
    tipo_analisis: "analisis_bases", resultado_json: { x: 1 },
    estado_aprobacion: "PENDIENTE", origen: "manual",
  });
}

test.describe("B5 — gate de aprobación de IA", () => {
  test.describe.configure({ mode: "serial" });

  test("con el flag OFF, un análisis PENDIENTE no bloquea el envío", async ({ page }) => {
    const s = await setup("ADMIN");
    await setFlag(s.orgId, false);
    await resultadoPendiente(s.orgId, s.licId);
    await login(page, s.email, s.password);

    const res = await page.request.post(`/api/licitaciones/${s.licId}/estado`, {
      data: { estado_licitacion: "ENVIADA" },
    });
    expect(res.status()).toBe(200);
    await admin.from("organizations").delete().eq("id", s.orgId);
  });

  test("con el flag ON, un análisis PENDIENTE bloquea con 409 y lista los análisis", async ({ page }) => {
    const s = await setup("ADMIN");
    await setFlag(s.orgId, true);
    await resultadoPendiente(s.orgId, s.licId);
    await login(page, s.email, s.password);

    const res = await page.request.post(`/api/licitaciones/${s.licId}/estado`, {
      data: { estado_licitacion: "ENVIADA" },
    });
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.error.details.analisisIaSinRevisar).toHaveLength(1);
    expect(body.error.details.analisisIaSinRevisar[0].tipo_analisis).toBe("analisis_bases");
    await admin.from("organizations").delete().eq("id", s.orgId);
  });

  test("un ADMIN puede omitir con omitir_revision_ia y queda en la bitácora", async ({ page }) => {
    const s = await setup("ADMIN");
    await setFlag(s.orgId, true);
    await resultadoPendiente(s.orgId, s.licId);
    await login(page, s.email, s.password);

    const res = await page.request.post(`/api/licitaciones/${s.licId}/estado`, {
      data: { estado_licitacion: "ENVIADA", omitir_revision_ia: true },
    });
    expect(res.status()).toBe(200);

    const { data: audit } = await admin
      .from("audit_log")
      .select("accion, detalle_json")
      .eq("organization_id", s.orgId)
      .eq("accion", "licitacion_enviada_ia_sin_revisar");
    expect(audit).toHaveLength(1);
    expect(audit![0].detalle_json.autorizado_por).toBe(s.userId);
    await admin.from("organizations").delete().eq("id", s.orgId);
  });

  test("un MANAGER NO puede omitir aunque mande omitir_revision_ia", async ({ page }) => {
    const s = await setup("MANAGER");
    await setFlag(s.orgId, true);
    await resultadoPendiente(s.orgId, s.licId);
    await login(page, s.email, s.password);

    const res = await page.request.post(`/api/licitaciones/${s.licId}/estado`, {
      data: { estado_licitacion: "ENVIADA", omitir_revision_ia: true },
    });
    expect(res.status()).toBe(409);
    await admin.from("organizations").delete().eq("id", s.orgId);
  });

  test("con el análisis APROBADO, el envío pasa aunque el flag esté ON", async ({ page }) => {
    const s = await setup("ADMIN");
    await setFlag(s.orgId, true);
    await admin.from("ai_results").insert({
      organization_id: s.orgId, recurso_tipo: "licitacion", recurso_id: s.licId,
      tipo_analisis: "analisis_bases", resultado_json: { x: 1 },
      estado_aprobacion: "APROBADO", origen: "manual",
    });
    await login(page, s.email, s.password);

    const res = await page.request.post(`/api/licitaciones/${s.licId}/estado`, {
      data: { estado_licitacion: "ENVIADA" },
    });
    expect(res.status()).toBe(200);
    await admin.from("organizations").delete().eq("id", s.orgId);
  });
});
