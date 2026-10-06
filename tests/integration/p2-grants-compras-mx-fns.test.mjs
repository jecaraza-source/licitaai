// Seguridad — `anon` no puede ejecutar guardar_propuesta_economica, y un
// usuario autenticado sí. Regresión de 20261006020000: el `revoke ... from
// anon` previo no tenía efecto porque `anon` heredaba `execute` de PUBLIC.
//
//   npx supabase start
//   node tests/integration/p2-grants-compras-mx-fns.test.mjs
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
const NIL = "00000000-0000-0000-0000-000000000000";

async function main() {
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

  // Sin config ni partidas la función no toca nada: sirve para probar solo el permiso.
  const args = { p_licitacion_id: NIL };

  const { error: eAnon } = await anon.rpc("guardar_propuesta_economica", args);
  check("anon NO puede ejecutar guardar_propuesta_economica",
    eAnon?.code === "42501" || /permission denied/i.test(eAnon?.message ?? ""),
    eAnon ? `${eAnon.code} ${eAnon.message}` : "no hubo error");

  const { error: eUser } = await asUser.rpc("guardar_propuesta_economica", args);
  check("authenticated SÍ puede ejecutar guardar_propuesta_economica", !eUser, eUser?.message);

  const { error: eSvc } = await admin.rpc("guardar_propuesta_economica", args);
  check("service_role SÍ puede ejecutar guardar_propuesta_economica", !eSvc, eSvc?.message);

  try {
    await admin.auth.admin.deleteUser(u.user.id);
    await admin.from("organizations").delete().eq("id", org.id);
  } catch { /* best-effort */ }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
