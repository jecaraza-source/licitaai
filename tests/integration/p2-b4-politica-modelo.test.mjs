// P2 punch-list B4 — resolver_modelo_ia aplica politica_modelo +
// modelos_permitidos por organización.
//
// Decisión de negocio (2026-08-28, aprobada por el usuario):
//   BASE       → Sonnet + Haiku + embeddings · economico_por_defecto (económico = Sonnet)
//   PRO        → + Opus · avanzado_si_confianza_baja (Sonnet→Opus si confianza baja)
//   ENTERPRISE → + Opus · siempre_avanzado (siempre Opus)
//
// Usage:
//   npx supabase start
//   node tests/integration/p2-b4-politica-modelo.test.mjs
import { createClient } from "@supabase/supabase-js";
import { LOCAL } from "../helpers/local-supabase.mjs";

const URL = process.env.SUPABASE_URL ?? LOCAL.url;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? LOCAL.serviceRoleKey;
if (URL.includes("supabase.co")) { console.error("local only"); process.exit(1); }

const admin = createClient(URL, SERVICE_KEY);
let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}${detail ? " — " + detail : ""}`); }
}
const rnd = () => Math.random().toString(36).slice(2, 10);

async function nuevaOrg() {
  const { data } = await admin.from("organizations").insert({ nombre: `Org ${rnd()}` }).select("id").single();
  return data.id;
}
const resolver = (org, deseado, baja = false) =>
  admin.rpc("resolver_modelo_ia", { p_org: org, p_modelo_deseado: deseado, p_confianza_baja: baja })
    .then(({ data, error }) => { if (error) throw new Error(error.message); return data; });

async function main() {
  // ── BASE: Sonnet + Haiku, economico_por_defecto (económico = Sonnet) ──
  {
    const org = await nuevaOrg();
    await admin.rpc("aplicar_plan_a_org", { p_org: org, p_plan: "BASE" });

    check("BASE 1. un análisis (pide sonnet) -> sonnet (económico ya es sonnet)", (await resolver(org, "claude-sonnet-5")) === "claude-sonnet-5");
    check("BASE 2. confianza baja no cambia nada -> sonnet", (await resolver(org, "claude-sonnet-5", true)) === "claude-sonnet-5");
    check("BASE 3. auditoría (pide haiku) -> sonnet (económico es el piso)", (await resolver(org, "claude-haiku-4-5")) === "claude-sonnet-5");
    check("BASE 4. embeddings pasan tal cual", (await resolver(org, "text-embedding-3-small")) === "text-embedding-3-small");

    const { data: pol } = await admin.from("ai_org_policy").select("modelos_permitidos, politica_modelo").eq("organization_id", org).single();
    check("BASE 5. la política quedó sembrada", pol.politica_modelo === "economico_por_defecto" && pol.modelos_permitidos.includes("claude-sonnet-5") && pol.modelos_permitidos.includes("claude-haiku-4-5") && !pol.modelos_permitidos.includes("claude-opus-5"));
    await admin.from("organizations").delete().eq("id", org);
  }

  // ── PRO: + Opus, avanzado_si_confianza_baja ─────────────────────────
  {
    const org = await nuevaOrg();
    await admin.rpc("aplicar_plan_a_org", { p_org: org, p_plan: "PRO" });
    check("PRO 1. análisis normal (pide sonnet) -> sonnet", (await resolver(org, "claude-sonnet-5")) === "claude-sonnet-5");
    check("PRO 2. análisis con confianza baja -> opus (escala un tier, permitido)", (await resolver(org, "claude-sonnet-5", true)) === "claude-opus-5");
    check("PRO 3. auditoría normal (pide haiku) -> haiku", (await resolver(org, "claude-haiku-4-5")) === "claude-haiku-4-5");

    const { data: pol } = await admin.from("ai_org_policy").select("politica_modelo").eq("organization_id", org).single();
    check("PRO 4. política = avanzado_si_confianza_baja", pol.politica_modelo === "avanzado_si_confianza_baja");
    await admin.from("organizations").delete().eq("id", org);
  }

  // ── ENTERPRISE: + Opus, siempre_avanzado ───────────────────────────
  {
    const org = await nuevaOrg();
    await admin.rpc("aplicar_plan_a_org", { p_org: org, p_plan: "ENTERPRISE" });
    check("ENT 1. análisis normal -> opus (siempre avanzado)", (await resolver(org, "claude-sonnet-5")) === "claude-opus-5");
    check("ENT 2. auditoría (pide haiku) -> opus (siempre avanzado)", (await resolver(org, "claude-haiku-4-5")) === "claude-opus-5");

    const { data: pol } = await admin.from("ai_org_policy").select("politica_modelo").eq("organization_id", org).single();
    check("ENT 3. política = siempre_avanzado", pol.politica_modelo === "siempre_avanzado");
    await admin.from("organizations").delete().eq("id", org);
  }

  // ── org sin fila de política -> defaults (todo permitido, economico) ─
  {
    const org = await nuevaOrg();
    check("SIN-POL 1. sin política, análisis -> sonnet (default economico)", (await resolver(org, "claude-sonnet-5")) === "claude-sonnet-5");
    check("SIN-POL 2. sin política, pide haiku -> sonnet (piso economico)", (await resolver(org, "claude-haiku-4-5")) === "claude-sonnet-5");
    await admin.from("organizations").delete().eq("id", org);
  }

  // ── siempre_avanzado (upsert directo) ──────────────────────────────
  {
    const org = await nuevaOrg();
    await admin.from("ai_org_policy").upsert({ organization_id: org, politica_modelo: "siempre_avanzado" });
    check("SIEMPRE 1. cualquier análisis -> opus", (await resolver(org, "claude-haiku-4-5")) === "claude-opus-5");
    await admin.from("organizations").delete().eq("id", org);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
