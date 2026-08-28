// P0.1 — positive/negative integration tests for the secure signup flow
// (handle_new_user / create_organization_for_signup / invitaciones_staff).
//
// Exercises the real Postgres trigger against a live Supabase instance —
// run this against the LOCAL stack only (`npx supabase start`), never
// against a shared/remote project, since it creates and deletes real
// auth.users / organizations rows using the service role key.
//
// Usage:
//   npx supabase start
//   node tests/integration/p0-signup-security.test.mjs
//
// Reads credentials from env vars, defaulting to the standard local
// Supabase CLI dev values (same on every machine unless config.toml
// overrides them):
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";

if (URL.includes("supabase.co")) {
  console.error("Refusing to run: SUPABASE_URL looks like a hosted/remote project, not local.");
  process.exit(1);
}

const anon = createClient(URL, ANON_KEY);
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

async function createUserWithMeta(email, meta) {
  return admin.auth.admin.createUser({
    email,
    password: "TestPassword123!",
    email_confirm: true,
    user_metadata: meta,
  });
}

async function main() {
  // ---------------------------------------------------------------------
  // 1. Normal signup: creates its own org, becomes ADMIN of THAT org only.
  // ---------------------------------------------------------------------
  {
    const { data: ticket, error: rpcErr } = await anon.rpc("create_organization_for_signup", {
      p_nombre: `Org Legit ${rnd()}`,
    });
    check("1a. create_organization_for_signup succeeds (anon)", !rpcErr && !!ticket, rpcErr?.message);

    const email = `legit-${rnd()}@example.org`;
    const { data, error } = await createUserWithMeta(email, { nombre: "Legit User", signup_ticket: ticket });
    check("1b. signUp with valid ticket succeeds", !error, error?.message);

    if (data?.user) {
      const { data: row } = await admin.from("users").select("organization_id, rol, rol_jerarquico").eq("id", data.user.id).single();
      const { data: ticketRow } = await admin.from("signup_tickets").select("organization_id, used_at").eq("id", ticket).single();
      check("1c. user's organization_id matches the ticket's organization", row?.organization_id === ticketRow?.organization_id);
      check("1d. user got rol = ADMIN", row?.rol === "ADMIN");
      check("1e. ticket is marked used", !!ticketRow?.used_at);
    }
  }

  // ---------------------------------------------------------------------
  // 2. Attacker sends an arbitrary organization_id + rol: ADMIN directly to
  //    signUp, WITHOUT ever calling create_organization_for_signup or
  //    holding a valid invitation. Must be rejected entirely.
  // ---------------------------------------------------------------------
  {
    const { data: victimOrg } = await admin.from("organizations").insert({ nombre: `Victim Org ${rnd()}` }).select("id").single();
    const email = `attacker-${rnd()}@example.org`;
    const { data, error } = await createUserWithMeta(email, {
      nombre: "Attacker",
      organization_id: victimOrg.id,
      rol: "ADMIN",
      rol_jerarquico: "SUPERVISOR",
    });
    check("2. signUp with forged organization_id/rol and NO ticket/invite is rejected", !!error, error ? undefined : "user was created!");
    if (data?.user) {
      // cleanup if it somehow succeeded, so it doesn't pollute later checks
      await admin.auth.admin.deleteUser(data.user.id);
    }
  }

  // ---------------------------------------------------------------------
  // 3. Attacker gets a legit ticket for THEIR OWN org, but tries to smuggle
  //    a different organization_id / higher rol_jerarquico in the same
  //    payload. The ticket's own org/rol must win, not the smuggled values.
  // ---------------------------------------------------------------------
  {
    const { data: victimOrg } = await admin.from("organizations").insert({ nombre: `Victim Org 2 ${rnd()}` }).select("id").single();
    const { data: ticket } = await anon.rpc("create_organization_for_signup", { p_nombre: `Attacker Org ${rnd()}` });
    const { data: legitTicketRow } = await admin.from("signup_tickets").select("organization_id").eq("id", ticket).single();

    const email = `smuggler-${rnd()}@example.org`;
    const { data } = await createUserWithMeta(email, {
      nombre: "Smuggler",
      signup_ticket: ticket,
      organization_id: victimOrg.id, // should be ignored
      rol_jerarquico: "SUPERVISOR", // should be ignored (self-signup ticket has no jerarquico)
    });
    if (data?.user) {
      const { data: row } = await admin.from("users").select("organization_id, rol_jerarquico").eq("id", data.user.id).single();
      check("3a. smuggled organization_id is ignored — user lands in their OWN new org", row?.organization_id === legitTicketRow.organization_id);
      check("3b. smuggled organization_id does NOT put user in victim org", row?.organization_id !== victimOrg.id);
      check("3c. smuggled rol_jerarquico is ignored (ticket had none)", row?.rol_jerarquico === null);
    } else {
      check("3a/3b/3c. smuggler signup", false, "signup unexpectedly failed entirely");
    }
  }

  // ---------------------------------------------------------------------
  // 4. Ticket reuse: second attempt with the SAME already-used ticket fails.
  // ---------------------------------------------------------------------
  {
    const { data: ticket } = await anon.rpc("create_organization_for_signup", { p_nombre: `Reuse Org ${rnd()}` });
    const email1 = `reuse1-${rnd()}@example.org`;
    const email2 = `reuse2-${rnd()}@example.org`;
    const first = await createUserWithMeta(email1, { nombre: "First", signup_ticket: ticket });
    check("4a. first use of a ticket succeeds", !first.error, first.error?.message);
    const second = await createUserWithMeta(email2, { nombre: "Second", signup_ticket: ticket });
    check("4b. second use of the SAME ticket is rejected", !!second.error, second.error ? undefined : "ticket was reused!");
  }

  // ---------------------------------------------------------------------
  // 5. Concurrent double-use: two simultaneous signups with the same ticket
  //    — exactly one must win.
  // ---------------------------------------------------------------------
  {
    const { data: ticket } = await anon.rpc("create_organization_for_signup", { p_nombre: `Race Org ${rnd()}` });
    const emailA = `racea-${rnd()}@example.org`;
    const emailB = `raceb-${rnd()}@example.org`;
    const [a, b] = await Promise.all([
      createUserWithMeta(emailA, { nombre: "A", signup_ticket: ticket }),
      createUserWithMeta(emailB, { nombre: "B", signup_ticket: ticket }),
    ]);
    const successes = [a, b].filter((r) => !r.error).length;
    check("5. concurrent signups with the same ticket: exactly one succeeds", successes === 1, `got ${successes} successes`);
  }

  // ---------------------------------------------------------------------
  // 6. Expired ticket is rejected.
  // ---------------------------------------------------------------------
  {
    const { data: org } = await admin.from("organizations").insert({ nombre: `Expired Org ${rnd()}` }).select("id").single();
    const { data: ticketRow } = await admin
      .from("signup_tickets")
      .insert({ organization_id: org.id, expires_at: new Date(Date.now() - 1000).toISOString() })
      .select("id")
      .single();
    const email = `expired-${rnd()}@example.org`;
    const { error } = await createUserWithMeta(email, { nombre: "Expired", signup_ticket: ticketRow.id });
    check("6. expired ticket is rejected", !!error, error ? undefined : "expired ticket was accepted!");
  }

  // ---------------------------------------------------------------------
  // 7. Invitation flow — happy path.
  // ---------------------------------------------------------------------
  let invOrgId, invAdminId;
  {
    const { data: org } = await admin.from("organizations").insert({ nombre: `Invite Org ${rnd()}` }).select("id").single();
    invOrgId = org.id;
    // fixture setup: create this org's admin via a real ticket (service
    // role inserts the ticket directly), same code path as a real user.
    const { data: fixtureTicket } = await admin.from("signup_tickets").insert({ organization_id: invOrgId }).select("id").single();
    const { data: adminUser, error: adminErr } = await createUserWithMeta(`inv-admin-${rnd()}@example.org`, {
      nombre: "Org Admin",
      signup_ticket: fixtureTicket.id,
    });
    if (adminErr || !adminUser?.user) {
      check("7-setup. fixture admin user created", false, adminErr?.message ?? "no user returned");
      return;
    }
    invAdminId = adminUser.user.id;

    const inviteEmail = `invitee-${rnd()}@example.org`;
    const { data: invite } = await admin
      .from("invitaciones_staff")
      .insert({ organization_id: invOrgId, email: inviteEmail, rol_jerarquico: "EJECUTOR", invitado_por: invAdminId })
      .select("token")
      .single();

    const { data, error } = await createUserWithMeta(inviteEmail, { nombre: "Invitee", invite_token: invite.token });
    check("7a. valid invitation signup succeeds", !error, error?.message);
    if (data?.user) {
      const { data: row } = await admin.from("users").select("organization_id, rol, rol_jerarquico").eq("id", data.user.id).single();
      check("7b. invitee lands in the inviting organization", row?.organization_id === invOrgId);
      check("7c. invitee gets rol = ANALYST", row?.rol === "ANALYST");
      check("7d. invitee gets the invited rol_jerarquico", row?.rol_jerarquico === "EJECUTOR");
    }
  }

  // ---------------------------------------------------------------------
  // 8. Invitation for a DIFFERENT email fails even with a valid token.
  // ---------------------------------------------------------------------
  {
    const { data: invite } = await admin
      .from("invitaciones_staff")
      .insert({ organization_id: invOrgId, email: `intended-${rnd()}@example.org`, rol_jerarquico: "EJECUTOR", invitado_por: invAdminId })
      .select("token")
      .single();
    const { error } = await createUserWithMeta(`different-${rnd()}@example.org`, {
      nombre: "Wrong Email",
      invite_token: invite.token,
    });
    check("8. invite token used with a different email is rejected", !!error, error ? undefined : "accepted with wrong email!");
  }

  // ---------------------------------------------------------------------
  // 9. Expired invitation fails.
  // ---------------------------------------------------------------------
  {
    const email = `expiredinv-${rnd()}@example.org`;
    const { data: invite } = await admin
      .from("invitaciones_staff")
      .insert({
        organization_id: invOrgId,
        email,
        rol_jerarquico: "EJECUTOR",
        invitado_por: invAdminId,
        expires_at: new Date(Date.now() - 1000).toISOString(),
      })
      .select("token")
      .single();
    const { error } = await createUserWithMeta(email, { nombre: "Expired Invite", invite_token: invite.token });
    check("9. expired invitation is rejected", !!error, error ? undefined : "expired invite was accepted!");
  }

  // ---------------------------------------------------------------------
  // 10. Already-used invitation is marked consumed after first use.
  // ---------------------------------------------------------------------
  {
    const email = `reuseinv-${rnd()}@example.org`;
    const { data: invite } = await admin
      .from("invitaciones_staff")
      .insert({ organization_id: invOrgId, email, rol_jerarquico: "EJECUTOR", invitado_por: invAdminId })
      .select("token")
      .single();
    const first = await createUserWithMeta(email, { nombre: "First Use", invite_token: invite.token });
    check("10a. first use of invitation succeeds", !first.error, first.error?.message);
    // Re-using the token with a still-unregistered but non-matching email
    // is covered by test 8; here we just confirm the invite is now marked
    // consumed, so a legitimate re-attempt would also be rejected.
    const { data: inviteRow } = await admin.from("invitaciones_staff").select("aceptada_at").eq("token", invite.token).single();
    check("10b. invitation is marked aceptada_at after use", !!inviteRow?.aceptada_at);
  }

  // ---------------------------------------------------------------------
  // 11. VIEWER cannot self-elevate: a VIEWER cannot INSERT into
  //     invitaciones_staff directly (defense in depth beyond the route's
  //     own ADMIN check — enforced by RLS regardless of API surface).
  // ---------------------------------------------------------------------
  {
    const { data: org } = await admin.from("organizations").insert({ nombre: `Viewer Org ${rnd()}` }).select("id").single();
    const { data: viewerTicket } = await admin.from("signup_tickets").insert({ organization_id: org.id }).select("id").single();
    const { data: viewerUser, error: viewerErr } = await createUserWithMeta(`viewer-${rnd()}@example.org`, {
      nombre: "Viewer",
      signup_ticket: viewerTicket.id,
    });
    if (viewerErr || !viewerUser?.user) {
      check("11-setup. fixture viewer user created", false, viewerErr?.message);
      return;
    }
    await admin.from("users").update({ organization_id: org.id, rol: "VIEWER" }).eq("id", viewerUser.user.id);

    const { data: signIn } = await anon.auth.signInWithPassword({
      email: viewerUser.user.email,
      password: "TestPassword123!",
    });
    const viewerClient = createClient(URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${signIn.session.access_token}` } },
    });
    const { error: insertErr } = await viewerClient
      .from("invitaciones_staff")
      .insert({ organization_id: org.id, email: `x-${rnd()}@example.org`, rol_jerarquico: "EJECUTOR" });
    check("11. VIEWER cannot insert an invitation directly (RLS)", !!insertErr, insertErr ? undefined : "VIEWER created an invite!");
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
