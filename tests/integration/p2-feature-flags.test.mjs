// P2 · G1 — integration tests para public.feature_flags (RLS + seed).
//
// Usage:
//   npx supabase start
//   node tests/integration/p2-feature-flags.test.mjs
import { createClient } from "@supabase/supabase-js";
import { LOCAL } from "../helpers/local-supabase.mjs";

const URL = process.env.SUPABASE_URL ?? LOCAL.url;
const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? LOCAL.anonKey;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? LOCAL.serviceRoleKey;

if (URL.includes("supabase.co")) {
  console.error("Refusing to run against a hosted/remote project — local only.");
  process.exit(1);
}

const admin = createClient(URL, SERVICE_KEY);
let pass = 0;
let fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}${detail ? " — " + detail : ""}`); }
}
const rnd = () => Math.random().toString(36).slice(2, 10);

async function makeOrgWithUser() {
  const { data: org } = await admin.from("organizations").insert({ nombre: `Org ${rnd()}` }).select("id").single();
  const { data: ticket } = await admin.from("signup_tickets").insert({ organization_id: org.id }).select("id").single();
  const email = `u-${rnd()}@example.org`;
  const { data: userData, error } = await admin.auth.admin.createUser({
    email, password: "TestPassword123!", email_confirm: true,
    user_metadata: { nombre: "Test User", signup_ticket: ticket.id },
  });
  if (error) throw error;
  const anon = createClient(URL, ANON_KEY);
  const { data: session } = await anon.auth.signInWithPassword({ email, password: "TestPassword123!" });
  const asUser = createClient(URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${session.session.access_token}` } },
  });
  return { orgId: org.id, userId: userData.user.id, asUser };
}

async function main() {
  const orgA = await makeOrgWithUser();

  // 1. Seed: los flags de P2 existen. (Otros tests de integración pueden
  //    dejar flags encendidos si crashean; aquí se comprueba el seed, no el
  //    estado vivo — por eso no se asegura enabled=false, solo que existan
  //    y que el default de la columna sea false.)
  {
    const { data } = await admin.from("feature_flags").select("key, enabled, rollout_pct");
    const p2 = (data ?? []).filter((f) => f.key.startsWith("jobs.") || f.key.startsWith("ai.") || f.key.startsWith("resiliencia.") || f.key.startsWith("perf.") || f.key.startsWith("retencion."));
    check("1. el seed insertó los flags de P2", p2.length >= 16, `encontrados ${p2.length}`);
    const { data: nuevo } = await admin.from("feature_flags")
      .insert({ key: `seed-check-${rnd()}` }).select("enabled, rollout_pct").single();
    check("2. el default de un flag nuevo es apagado (enabled=false, rollout_pct=0)", nuevo.enabled === false && nuevo.rollout_pct === 0);
    await admin.from("feature_flags").delete().eq("enabled", false).like("key", "seed-check-%");
  }

  // 3. RLS: un usuario autenticado puede LEER los flags.
  {
    const { data, error } = await orgA.asUser.from("feature_flags").select("key").eq("key", "jobs.async_analizar_bases");
    check("3. un usuario autenticado puede leer feature_flags", !error && data?.length === 1, error?.message);
  }

  // 4. RLS: un usuario autenticado NO puede escribir (insert/update/delete).
  {
    const { error: insErr } = await orgA.asUser.from("feature_flags").insert({ key: `hack.${rnd()}`, enabled: true });
    check("4. un usuario autenticado no puede INSERT en feature_flags", !!insErr);

    const { data: upd } = await orgA.asUser
      .from("feature_flags").update({ enabled: true }).eq("key", "jobs.async_analizar_bases").select("key");
    check("5. un usuario autenticado no puede UPDATE feature_flags (RLS lo filtra a 0 filas)", (upd ?? []).length === 0);

    const { data: after } = await admin.from("feature_flags").select("enabled").eq("key", "jobs.async_analizar_bases").single();
    check("6. el flag sigue apagado tras el intento de UPDATE", after.enabled === false);

    const { data: del } = await orgA.asUser
      .from("feature_flags").delete().eq("key", "jobs.async_analizar_bases").select("key");
    check("7. un usuario autenticado no puede DELETE feature_flags", (del ?? []).length === 0);
  }

  // 8. Un anónimo (sin sesión) no puede leer.
  {
    const anon = createClient(URL, ANON_KEY);
    const { data } = await anon.from("feature_flags").select("key");
    check("8. un cliente anónimo no puede leer feature_flags", (data ?? []).length === 0);
  }

  // limpieza
  try {
    await admin.auth.admin.deleteUser(orgA.userId);
    await admin.from("organizations").delete().eq("id", orgA.orgId);
  } catch { /* best-effort */ }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
