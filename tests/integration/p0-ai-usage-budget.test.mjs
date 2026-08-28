// P0.6 — integration tests for the AI usage log and daily per-organization
// token budget (supabase/migrations/20260826230000_p0_ai_usage_budget.sql).
//
// registrar_uso_ia/check_ai_budget are SECURITY DEFINER and derive
// organization_id/user_id from auth.uid() server-side — never from a
// parameter the caller controls — so these tests specifically check: (1) a
// user cannot inflate/read another organization's usage by any parameter
// trick, (2) the budget actually blocks once the cap is reached, (3) usage
// from one org never counts against another org's cap, (4) ai_usage_log
// itself is only readable by members of the same organization (RLS).
//
// Usage:
//   npx supabase start
//   node tests/integration/p0-ai-usage-budget.test.mjs
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

async function makeOrgWithUser() {
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
  const anon = createClient(URL, ANON_KEY);
  const { data: session } = await anon.auth.signInWithPassword({ email, password: "TestPassword123!" });
  const asUser = createClient(URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${session.session.access_token}` } },
  });
  return { orgId: org.id, userId: userData.user.id, asUser, token: session.session.access_token };
}

async function main() {
  const orgA = await makeOrgWithUser();
  const orgB = await makeOrgWithUser();

  // -----------------------------------------------------------------------
  // 1. registrar_uso_ia requires auth — an anon (unauthenticated) call fails.
  // -----------------------------------------------------------------------
  {
    const anon = createClient(URL, ANON_KEY);
    const { error } = await anon.rpc("registrar_uso_ia", {
      p_funcion: "test",
      p_modelo: "claude-sonnet-5",
      p_input_tokens: 100,
      p_output_tokens: 50,
    });
    check("1. registrar_uso_ia rejects an unauthenticated caller", !!error);
  }

  // -----------------------------------------------------------------------
  // 2. registrar_uso_ia records usage scoped to the CALLER's own org, even
  //    though the RPC takes no organization_id parameter at all (so there's
  //    nothing to spoof) — org A's insert must show up under org A only.
  // -----------------------------------------------------------------------
  {
    const { error } = await orgA.asUser.rpc("registrar_uso_ia", {
      p_funcion: "analizar-bases",
      p_modelo: "claude-sonnet-5",
      p_input_tokens: 1000,
      p_output_tokens: 200,
    });
    check("2. registrar_uso_ia succeeds for an authenticated user", !error, error?.message);

    const { data: rows } = await admin
      .from("ai_usage_log")
      .select("organization_id, input_tokens, output_tokens, funcion")
      .eq("organization_id", orgA.orgId);
    check(
      "3. the logged row is attributed to org A's organization_id, derived server-side",
      rows?.length === 1 && rows[0].input_tokens === 1000 && rows[0].output_tokens === 200,
      JSON.stringify(rows),
    );
  }

  // -----------------------------------------------------------------------
  // 3. RLS: org B cannot read org A's usage log rows.
  // -----------------------------------------------------------------------
  {
    const { data: rows } = await orgB.asUser.from("ai_usage_log").select("id").eq("organization_id", orgA.orgId);
    check("4. org B cannot read org A's ai_usage_log rows (RLS)", (rows ?? []).length === 0);
  }
  {
    const { data: rows } = await orgA.asUser.from("ai_usage_log").select("id").eq("organization_id", orgA.orgId);
    check("5. org A can read its own ai_usage_log rows", (rows ?? []).length >= 1);
  }

  // -----------------------------------------------------------------------
  // 4. Negative writes are clamped to 0, not stored as negative (a
  //    malformed/adversarial usage value can't be used to inflate a
  //    remaining budget).
  // -----------------------------------------------------------------------
  {
    const { error } = await orgA.asUser.rpc("registrar_uso_ia", {
      p_funcion: "test-negativo",
      p_modelo: "claude-sonnet-5",
      p_input_tokens: -999999,
      p_output_tokens: -999999,
    });
    check("6. registrar_uso_ia accepts a negative-token call without erroring", !error, error?.message);
    const { data: row } = await admin
      .from("ai_usage_log")
      .select("input_tokens, output_tokens")
      .eq("organization_id", orgA.orgId)
      .eq("funcion", "test-negativo")
      .single();
    check("7. ...but clamps negative token counts to 0 rather than storing them", row?.input_tokens === 0 && row?.output_tokens === 0, JSON.stringify(row));
  }

  // -----------------------------------------------------------------------
  // 5. check_ai_budget: under a low cap, org A (which already logged 1000+200
  //    tokens above) is now OVER a cap of 500 — must return false.
  //    Org B (no usage yet) is under that same cap — must return true.
  //    This also proves the cap is evaluated per-organization, not globally.
  // -----------------------------------------------------------------------
  {
    const { data: dentroA } = await orgA.asUser.rpc("check_ai_budget", { p_limite_diario: 500 });
    check("8. check_ai_budget returns false for org A once its usage exceeds a 500-token cap", dentroA === false);

    const { data: dentroB } = await orgB.asUser.rpc("check_ai_budget", { p_limite_diario: 500 });
    check("9. check_ai_budget returns true for org B, which has zero usage — orgs don't share a budget", dentroB === true);
  }

  // -----------------------------------------------------------------------
  // 6. check_ai_budget with the default (generous) cap: org A is still
  //    comfortably under it with ~1200 tokens logged.
  // -----------------------------------------------------------------------
  {
    const { data: dentroA } = await orgA.asUser.rpc("check_ai_budget");
    check("10. check_ai_budget with the default cap (3,000,000/day) still allows org A", dentroA === true);
  }

  // -----------------------------------------------------------------------
  // 7. check_ai_budget requires auth too.
  // -----------------------------------------------------------------------
  {
    const anon = createClient(URL, ANON_KEY);
    const { data, error } = await anon.rpc("check_ai_budget", { p_limite_diario: 500 });
    check("11. check_ai_budget denies (false, no error) an unauthenticated caller", data === false || !!error);
  }

  // -----------------------------------------------------------------------
  // 8. End-to-end: an Edge Function that declares requiereIA:true (see
  //    authenticate() in _shared/auth.ts) must actually reject with 429
  //    BEFORE doing any work, once the caller's org is over budget — this
  //    proves the wiring in the real HTTP entrypoint, not just the RPC in
  //    isolation. No ANTHROPIC_API_KEY needed: the budget check runs before
  //    any AI client is even constructed.
  // -----------------------------------------------------------------------
  {
    const orgC = await makeOrgWithUser();
    // Push org C comfortably over a very low ambient cap by logging a lot
    // of usage directly (equivalent to what registrarUsoIA would do after
    // many real calls).
    await orgC.asUser.rpc("registrar_uso_ia", {
      p_funcion: "seed",
      p_modelo: "claude-sonnet-5",
      p_input_tokens: 5_000_000,
      p_output_tokens: 0,
    });

    const res = await fetch(`${FUNCTIONS_URL}/auditar-documento`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${orgC.token}` },
      body: JSON.stringify({ documento_id: "00000000-0000-0000-0000-000000000000" }),
    });
    check(
      "12. auditar-documento (requiereIA:true, default 3,000,000/day cap) returns 429 once org usage exceeds the cap",
      res.status === 429,
      `got ${res.status}`,
    );
  }
  {
    const orgD = await makeOrgWithUser();
    // orgD has zero usage — the budget check must pass, so the function
    // proceeds past authenticate() and fails later for an unrelated reason
    // (the fake documento_id doesn't exist -> 404), never 429.
    const res = await fetch(`${FUNCTIONS_URL}/auditar-documento`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${orgD.token}` },
      body: JSON.stringify({ documento_id: "00000000-0000-0000-0000-000000000000" }),
    });
    check(
      "13. auditar-documento does NOT return 429 for an org with zero AI usage",
      res.status !== 429,
      `got ${res.status}`,
    );
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
