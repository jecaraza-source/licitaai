// P2 punch-list B4 — resolver_modelo_ia aplica politica_modelo +
// modelos_permitidos por organización.
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
  // ── BASE: solo Haiku, economico_por_defecto ──────────────────────────
  {
    const org = await nuevaOrg();
    await admin.rpc("aplicar_plan_a_org", { p_org: org, p_plan: "BASE" });

    check("BASE 1. un análisis (pide sonnet) -> haiku (economico)", (await resolver(org, "claude-sonnet-5")) === "claude-haiku-4-5");
    check("BASE 2. con confianza baja pediría sonnet, pero no está permitido -> haiku", (await resolver(org, "claude-sonnet-5", true)) === "claude-haiku-4-5");
    check("BASE 3. embeddings pasan tal cual", (await resolver(org, "text-embedding-3-small")) === "text-embedding-3-small");

    const { data: pol } = await admin.from("ai_org_policy").select("modelos_permitidos, politica_modelo").eq("organization_id", org).single();
    check("BASE 4. la política quedó sembrada", pol.politica_modelo === "economico_por_defecto" && pol.modelos_permitidos.includes("claude-haiku-4-5") && !pol.modelos_permitidos.includes("claude-sonnet-5"));
    await admin.from("organizations").delete().eq("id", org);
  }

  // ── PRO: Haiku + Sonnet, economico ──────────────────────────────────
  {
    const org = await nuevaOrg();
    await admin.rpc("aplicar_plan_a_org", { p_org: org, p_plan: "PRO" });
    check("PRO 1. análisis normal -> haiku (economico)", (await resolver(org, "claude-sonnet-5")) === "claude-haiku-4-5");
    check("PRO 2. análisis con confianza baja -> sonnet (escala, y está permitido)", (await resolver(org, "claude-sonnet-5", true)) === "claude-sonnet-5");
    check("PRO 3. opus no está permitido -> se recorta a sonnet", (await resolver(org, "claude-opus-5", true)) === "claude-sonnet-5");
    await admin.from("organizations").delete().eq("id", org);
  }

  // ── ENTERPRISE: todo, avanzado_si_confianza_baja ────────────────────
  {
    const org = await nuevaOrg();
    await admin.rpc("aplicar_plan_a_org", { p_org: org, p_plan: "ENTERPRISE" });
    check("ENT 1. análisis normal -> sonnet (el deseado, política avanzada mantiene)", (await resolver(org, "claude-sonnet-5")) === "claude-sonnet-5");
    check("ENT 2. análisis con confianza baja -> opus (escala un tier)", (await resolver(org, "claude-sonnet-5", true)) === "claude-opus-5");
    check("ENT 3. auditoría (pide haiku) normal -> haiku", (await resolver(org, "claude-haiku-4-5")) === "claude-haiku-4-5");
    await admin.from("organizations").delete().eq("id", org);
  }

  // ── org sin fila de política -> defaults (todo, economico) ──────────
  {
    const org = await nuevaOrg();
    check("SIN-POL 1. sin política, análisis -> haiku (default economico)", (await resolver(org, "claude-sonnet-5")) === "claude-haiku-4-5");
    check("SIN-POL 2. sin política, confianza baja -> sonnet", (await resolver(org, "claude-sonnet-5", true)) === "claude-sonnet-5");
    await admin.from("organizations").delete().eq("id", org);
  }

  // ── siempre_avanzado ────────────────────────────────────────────────
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
