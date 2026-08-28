// P2 · C1 — integration tests para el gobierno de costo de IA
// (migración 20260828000000_p2_c1_gobierno_costo_ia.sql).
//
//   npx supabase start
//   node tests/integration/p2-c1-gobierno-costo-ia.test.mjs
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
const near = (a, b, eps = 1e-6) => Math.abs(Number(a) - Number(b)) < eps;

async function makeOrgWithUser() {
  const { data: org } = await admin.from("organizations").insert({ nombre: `Org ${rnd()}` }).select("id").single();
  const { data: ticket } = await admin.from("signup_tickets").insert({ organization_id: org.id }).select("id").single();
  const email = `u-${rnd()}@example.org`;
  const { data: u } = await admin.auth.admin.createUser({
    email, password: "TestPassword123!", email_confirm: true,
    user_metadata: { nombre: "T", signup_ticket: ticket.id },
  });
  const anon = createClient(URL, ANON_KEY);
  const { data: sess } = await anon.auth.signInWithPassword({ email, password: "TestPassword123!" });
  const asUser = createClient(URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${sess.session.access_token}` } },
  });
  return { orgId: org.id, userId: u.user.id, asUser };
}

const gasto = async (orgId) => {
  const { data } = await admin.from("ai_budget_ledger").select("estado, monto_usd").eq("organization_id", orgId);
  return (data ?? []).reduce((s, r) => s + (["RESERVADO", "CONSUMIDO"].includes(r.estado) ? 1 : -1) * Number(r.monto_usd), 0);
};

async function main() {
  const orgA = await makeOrgWithUser();
  const orgB = await makeOrgWithUser();

  // 1. ai_policy_de_org crea la política por defecto.
  {
    const { data, error } = await admin.rpc("ai_policy_de_org", { p_org: orgA.orgId });
    check("1. ai_policy_de_org devuelve/crea la política por defecto", !error && Number(data.cuota_mensual_usd) === 60 && data.politica_modelo === "economico_por_defecto", error?.message);
    const { count } = await admin.from("ai_org_policy").select("organization_id", { count: "exact", head: true }).eq("organization_id", orgA.orgId);
    check("2. la fila de política quedó persistida", count === 1);
  }

  // 3. estimar_costo_ia.
  {
    const { data: sonnet } = await admin.rpc("estimar_costo_ia", { p_modelo: "claude-sonnet-5", p_tokens_input: 1000, p_tokens_output: 200 });
    check("3. estimar_costo_ia (sonnet 1000/200) = 0.004", near(sonnet, 0.004), String(sonnet));
    const { data: emb } = await admin.rpc("estimar_costo_ia", { p_modelo: "text-embedding-3-small", p_tokens_input: 500000, p_tokens_output: 0 });
    check("4. estimar_costo_ia (embeddings 500k) = 0.01", near(emb, 0.01), String(emb));
    const { data: desc } = await admin.rpc("estimar_costo_ia", { p_modelo: "modelo-inventado", p_tokens_input: 1000000, p_tokens_output: 0 });
    check("5. modelo desconocido usa tarifa conservadora (sonnet)", near(desc, 2.0), String(desc));
  }

  // 6. reservar_presupuesto_ia feliz.
  {
    const { data: reservaId, error } = await orgA.asUser.rpc("reservar_presupuesto_ia", { p_tipo: "analizar-bases", p_estimado_usd: 0.5 });
    check("6. reservar_presupuesto_ia devuelve un reserva_id", !error && typeof reservaId === "string", error?.message);
    const { data: rows } = await admin.from("ai_budget_ledger").select("estado, monto_usd").eq("reserva_id", reservaId);
    check("7. quedó una fila RESERVADO por el monto estimado", rows?.length === 1 && rows[0].estado === "RESERVADO" && near(rows[0].monto_usd, 0.5));
    check("8. el gasto de la organización refleja la reserva", near(await gasto(orgA.orgId), 0.5));
  }

  // 9. límite por operación.
  {
    const { error } = await orgA.asUser.rpc("reservar_presupuesto_ia", { p_tipo: "x", p_estimado_usd: 5 });
    check("9. reservar por encima del límite por operación ($2) falla", !!error && (error.hint ?? "").includes("limite_por_operacion"), JSON.stringify(error));
  }

  // 10. límite diario.
  {
    await admin.from("ai_org_policy").update({ limite_diario_usd: 0.6 }).eq("organization_id", orgA.orgId);
    // ya hay 0.5 reservado; otra de 0.5 excede 0.6
    const { error } = await orgA.asUser.rpc("reservar_presupuesto_ia", { p_tipo: "x", p_estimado_usd: 0.5 });
    check("10. reservar que excede el límite diario falla", !!error && (error.hint ?? "").includes("limite_diario"), JSON.stringify(error));
    await admin.from("ai_org_policy").update({ limite_diario_usd: 10 }).eq("organization_id", orgA.orgId);
  }

  // 11. cuota mensual.
  {
    await admin.from("ai_org_policy").update({ cuota_mensual_usd: 0.7 }).eq("organization_id", orgA.orgId);
    const { error } = await orgA.asUser.rpc("reservar_presupuesto_ia", { p_tipo: "x", p_estimado_usd: 0.5 });
    check("11. reservar que agota la cuota mensual falla", !!error && (error.hint ?? "").includes("cuota_mensual"), JSON.stringify(error));
    await admin.from("ai_org_policy").update({ cuota_mensual_usd: 60 }).eq("organization_id", orgA.orgId);
  }

  // 12. conciliación: reserva -> costo real, sobrante liberado.
  {
    const orgC = await makeOrgWithUser();
    const { data: reservaId } = await orgC.asUser.rpc("reservar_presupuesto_ia", { p_tipo: "analizar-bases", p_estimado_usd: 1.0 });
    // costo real: sonnet 20000 in + 4000 out = 0.04 + 0.04 = 0.08
    const { error } = await admin.rpc("conciliar_presupuesto_ia", {
      p_organization_id: orgC.orgId, p_reserva_id: reservaId,
      p_tokens_input: 20000, p_tokens_output: 4000, p_modelo: "claude-sonnet-5",
    });
    check("12. conciliar_presupuesto_ia no falla", !error, error?.message);
    check("13. el gasto neto queda en el costo real (0.08), no en el estimado (1.0)", near(await gasto(orgC.orgId), 0.08), String(await gasto(orgC.orgId)));

    // idempotencia
    await admin.rpc("conciliar_presupuesto_ia", {
      p_organization_id: orgC.orgId, p_reserva_id: reservaId,
      p_tokens_input: 20000, p_tokens_output: 4000, p_modelo: "claude-sonnet-5",
    });
    check("14. conciliar dos veces no duplica el consumo", near(await gasto(orgC.orgId), 0.08));

    await admin.auth.admin.deleteUser(orgC.userId);
    await admin.from("organizations").delete().eq("id", orgC.orgId);
  }

  // 15. liberación total en fallo.
  {
    const orgD = await makeOrgWithUser();
    const { data: reservaId } = await orgD.asUser.rpc("reservar_presupuesto_ia", { p_tipo: "x", p_estimado_usd: 0.9 });
    check("15b. reserva refleja 0.9 de gasto", near(await gasto(orgD.orgId), 0.9));
    await admin.rpc("liberar_reserva_ia", { p_organization_id: orgD.orgId, p_reserva_id: reservaId });
    check("15. liberar_reserva_ia deja el gasto neto en 0", near(await gasto(orgD.orgId), 0));
    await admin.auth.admin.deleteUser(orgD.userId);
    await admin.from("organizations").delete().eq("id", orgD.orgId);
  }

  // 16. RLS entre organizaciones.
  {
    const { data: ledgerB } = await orgB.asUser.from("ai_budget_ledger").select("id").eq("organization_id", orgA.orgId);
    check("16. org B no ve el ledger de org A", (ledgerB ?? []).length === 0);
    const { data: polB } = await orgB.asUser.from("ai_org_policy").select("organization_id").eq("organization_id", orgA.orgId);
    check("17. org B no ve la política de org A", (polB ?? []).length === 0);
    const { data: pricing } = await orgB.asUser.from("ai_model_pricing").select("modelo");
    check("18. el catálogo de precios sí es legible por cualquier usuario", (pricing ?? []).length >= 4);
  }

  // 19. presupuesto_ia_disponible.
  {
    const { data } = await admin.rpc("presupuesto_ia_disponible", { p_org: orgA.orgId });
    const fila = Array.isArray(data) ? data[0] : data;
    check("19. presupuesto_ia_disponible descuenta el gasto de la cuota", near(fila.mensual_disponible_usd, 60 - 0.5), JSON.stringify(fila));
  }

  // limpieza
  try {
    await admin.from("ai_budget_ledger").delete().in("organization_id", [orgA.orgId, orgB.orgId]);
    await admin.auth.admin.deleteUser(orgA.userId);
    await admin.auth.admin.deleteUser(orgB.userId);
    await admin.from("organizations").delete().in("id", [orgA.orgId, orgB.orgId]);
  } catch { /* best-effort */ }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
