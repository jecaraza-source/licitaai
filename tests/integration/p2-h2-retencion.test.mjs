// P2 · H2 — integration: política de retención + ejecutar_limpieza_retencion
// (migración 20260902000000).
//
//   npx supabase start
//   node tests/integration/p2-h2-retencion.test.mjs
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";
const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";

if (URL.includes("supabase.co")) {
  console.error("Refusing to run against a hosted/remote project — local only.");
  process.exit(1);
}

const admin = createClient(URL, SERVICE_KEY);
let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  if (ok) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}${detail ? " — " + detail : ""}`); }
};
const rnd = () => Math.random().toString(36).slice(2, 10);
const antiguo = (dias) => new Date(Date.now() - dias * 86400_000).toISOString();

async function main() {
  const { data: org } = await admin.from("organizations").insert({ nombre: `Org ${rnd()}` }).select("id").single();
  const { data: ticket } = await admin.from("signup_tickets").insert({ organization_id: org.id }).select("id").single();
  const { data: u } = await admin.auth.admin.createUser({
    email: `u-${rnd()}@example.org`, password: "TestPassword123!", email_confirm: true,
    user_metadata: { nombre: "T", signup_ticket: ticket.id },
  });
  const userId = u.user.id;

  // --- 1. la migración sembró las políticas y todas arrancan seguras ---
  {
    const { data: pols } = await admin.from("data_retention_policy").select("*");
    check("1. data_retention_policy sembrada (>= 6 recursos)", (pols ?? []).length >= 6);
    check("2. TODA política arranca activo=false", pols.every((p) => p.activo === false));
    check("3. TODA política arranca dry_run=true", pols.every((p) => p.dry_run === true));
  }

  // --- 2. authenticated no puede ver ni ejecutar ---
  {
    const anon = createClient(URL, ANON_KEY);
    const { data: sess } = await anon.auth.signInWithPassword({ email: u.user.email, password: "TestPassword123!" });
    const asUser = createClient(URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${sess.session.access_token}` } },
    });
    const { data: verPol } = await asUser.from("data_retention_policy").select("*");
    check("4. authenticated no ve data_retention_policy (RLS sin policy)", (verPol ?? []).length === 0);
    const { error: eEjec } = await asUser.rpc("ejecutar_limpieza_retencion", {});
    check("5. authenticated no puede ejecutar_limpieza_retencion", !!eEjec);
  }

  // --- 3. datos viejos: rate_limit_hits ---
  {
    await admin.from("rate_limit_hits").insert([
      { user_id: userId, ruta: "/x", created_at: antiguo(30) },
      { user_id: userId, ruta: "/x", created_at: antiguo(30) },
      { user_id: userId, ruta: "/x", created_at: antiguo(1) },
    ]);
  }

  // --- 4. datos viejos: ai_usage_log ---
  {
    await admin.from("ai_usage_log").insert([
      { organization_id: org.id, funcion: "f", modelo: "m", input_tokens: 1, created_at: antiguo(400) },
      { organization_id: org.id, funcion: "f", modelo: "m", input_tokens: 1, created_at: antiguo(10) },
    ]);
  }

  // --- 5. dry-run: cuenta pero no borra ---
  {
    await admin.from("data_retention_policy").update({ activo: true }).in("recurso", ["rate_limit_hits", "ai_usage_log"]);
    const { data: rep } = await admin.rpc("ejecutar_limpieza_retencion", {});
    const rlh = rep.recursos.find((r) => r.recurso === "rate_limit_hits");
    const aul = rep.recursos.find((r) => r.recurso === "ai_usage_log");
    check("6. dry-run marca rate_limit_hits candidatas=2", rlh.candidatas === 2 && rlh.dry_run === true && rlh.borradas === 0);
    check("7. dry-run marca ai_usage_log candidatas=1", aul.candidatas === 1 && aul.borradas === 0);

    const { count: cRlh } = await admin.from("rate_limit_hits").select("*", { count: "exact", head: true }).eq("user_id", userId);
    check("8. dry-run NO borró filas de rate_limit_hits", cRlh === 3);

    const { data: polTras } = await admin.from("data_retention_policy").select("ultima_ejecucion_at, ultimo_resultado").eq("recurso", "rate_limit_hits").single();
    check("9. la política registró ultima_ejecucion_at + ultimo_resultado", !!polTras.ultima_ejecucion_at && polTras.ultimo_resultado?.candidatas === 2);
  }

  // --- 6. p_forzar_dry_run=true fuerza observación aun con dry_run=false ---
  {
    await admin.from("data_retention_policy").update({ dry_run: false }).eq("recurso", "rate_limit_hits");
    const { data: rep } = await admin.rpc("ejecutar_limpieza_retencion", { p_forzar_dry_run: true });
    const rlh = rep.recursos.find((r) => r.recurso === "rate_limit_hits");
    check("10. p_forzar_dry_run=true ignora dry_run=false de la fila", rlh.dry_run === true && rlh.borradas === 0);
    const { count } = await admin.from("rate_limit_hits").select("*", { count: "exact", head: true }).eq("user_id", userId);
    check("11. sigue sin borrar bajo forzar_dry_run", count === 3);
  }

  // --- 7. real: borra rate_limit_hits (sin archivar) ---
  {
    const { data: rep } = await admin.rpc("ejecutar_limpieza_retencion", {});
    const rlh = rep.recursos.find((r) => r.recurso === "rate_limit_hits");
    check("12. real borró 2 filas viejas de rate_limit_hits", rlh.borradas === 2 && rlh.dry_run === false);
    const { count } = await admin.from("rate_limit_hits").select("*", { count: "exact", head: true }).eq("user_id", userId);
    check("13. queda solo la fila reciente", count === 1);
    const { count: cArch } = await admin.from("retencion_archive").select("*", { count: "exact", head: true }).eq("recurso", "rate_limit_hits");
    check("14. rate_limit_hits NO se archiva (archiva=false)", cArch === 0);
  }

  // --- 8. real: archiva + borra ai_usage_log ---
  {
    await admin.from("data_retention_policy").update({ dry_run: false }).eq("recurso", "ai_usage_log");
    const { data: rep } = await admin.rpc("ejecutar_limpieza_retencion", {});
    const aul = rep.recursos.find((r) => r.recurso === "ai_usage_log");
    check("15. real archivó y borró 1 fila de ai_usage_log", aul.borradas === 1 && aul.archivadas === 1);
    const { data: arch } = await admin.from("retencion_archive").select("*").eq("recurso", "ai_usage_log");
    check("16. la fila quedó en retencion_archive con organization_id y jsonb", arch.length === 1 && arch[0].organization_id === org.id && arch[0].fila.funcion === "f");
    const { count } = await admin.from("ai_usage_log").select("*", { count: "exact", head: true }).eq("organization_id", org.id);
    check("17. queda solo la fila reciente de ai_usage_log", count === 1);
  }

  // --- 9. retencion_archive es inmutable ---
  {
    const { data: fila } = await admin.from("retencion_archive").select("id").limit(1).single();
    const { error: eUpd } = await admin.from("retencion_archive").update({ recurso: "x" }).eq("id", fila.id);
    check("18. retencion_archive rechaza UPDATE", !!eUpd);
    const { error: eDel } = await admin.from("retencion_archive").delete().eq("id", fila.id);
    check("19. retencion_archive rechaza DELETE", !!eDel);
  }

  // limpieza
  await admin.from("data_retention_policy").update({ activo: false, dry_run: true }).in("recurso", ["rate_limit_hits", "ai_usage_log"]);
  try { await admin.auth.admin.deleteUser(userId); } catch { /* audit / archive FK */ }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
