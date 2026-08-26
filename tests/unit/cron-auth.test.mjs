// P0.6 (additional finding) — unit tests for estaAutorizadoCron
// (src/lib/cron-auth.ts), which gates src/app/api/cron/alertas-vencimiento
// — the one Next.js route that uses the service role directly. Before this
// fix, a deployment where CRON_SECRET was unset would compare the incoming
// header against the literal string "Bearer undefined" instead of
// rejecting outright, since `` `Bearer ${undefined}` `` is a valid template
// string — a guessable bypass, not a crash.
// Run: npx tsx tests/unit/cron-auth.test.mjs
import { estaAutorizadoCron } from "../../src/lib/cron-auth.ts";

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

check("correct header with a configured secret is authorized", estaAutorizadoCron("Bearer abc123", "abc123"));
check("wrong header with a configured secret is rejected", !estaAutorizadoCron("Bearer wrong", "abc123"));
check("missing header with a configured secret is rejected", !estaAutorizadoCron(null, "abc123"));
check(
  "CRON_SECRET unset: the literal 'Bearer undefined' bypass is rejected (this was the actual bug)",
  !estaAutorizadoCron("Bearer undefined", undefined),
);
check("CRON_SECRET unset: any other header is also rejected", !estaAutorizadoCron("Bearer abc123", undefined));
check("CRON_SECRET set to empty string is treated as unset and rejected", !estaAutorizadoCron("Bearer ", ""));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
