// P2 · J — genera N (organización, access token) para el script de k6.
//
//   node tests/load/gen-tokens.mjs 20 > /tmp/tokens.json
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON = process.env.SUPABASE_ANON_KEY ?? "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";

if (URL.includes("supabase.co")) {
  console.error("Solo local.");
  process.exit(1);
}

const n = Number(process.argv[2] ?? "10");
const admin = createClient(URL, SERVICE);
const rnd = () => Math.random().toString(36).slice(2, 10);

const salida = [];
for (let i = 0; i < n; i++) {
  const { data: org } = await admin.from("organizations").insert({ nombre: `k6 ${rnd()}` }).select("id").single();
  const { data: ticket } = await admin.from("signup_tickets").insert({ organization_id: org.id }).select("id").single();
  const email = `k6-${rnd()}@example.org`;
  await admin.auth.admin.createUser({
    email, password: "TestPassword123!", email_confirm: true,
    user_metadata: { nombre: "k6", signup_ticket: ticket.id },
  });
  const anon = createClient(URL, ANON);
  const { data: sess } = await anon.auth.signInWithPassword({ email, password: "TestPassword123!" });
  salida.push({ organizationId: org.id, accessToken: sess.session.access_token });
  process.stderr.write(`.`);
}
process.stderr.write(`\n${n} tokens generados\n`);
console.log(JSON.stringify(salida, null, 2));
