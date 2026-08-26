// P1.1 — unit tests for the ApiError catalog (src/lib/api/errors.ts) and the
// uniform response envelope (src/lib/api/response.ts). This is the
// foundation every migrated API route relies on for a consistent
// {data, error, meta} contract — a bug here breaks every route at once.
// Run: npx tsx tests/unit/api-errors.test.mjs
import { ApiError } from "../../src/lib/api/errors.ts";
import { apiOk, apiErrorResponse } from "../../src/lib/api/response.ts";

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

check("unauthenticated() maps to 401", ApiError.unauthenticated().status === 401);
check("forbidden() maps to 403", ApiError.forbidden().status === 403);
check("notFound() maps to 404", ApiError.notFound().status === 404);
check("validation() maps to 400", ApiError.validation("bad input").status === 400);
check("conflict() maps to 409", ApiError.conflict("busy").status === 409);
check("unprocessableContent() maps to 422", ApiError.unprocessableContent("bad content").status === 422);
check("payloadTooLarge() maps to 413", ApiError.payloadTooLarge().status === 413);
check("rateLimited() maps to 429", ApiError.rateLimited().status === 429);
check("aiBudgetExceeded() maps to 429", ApiError.aiBudgetExceeded().status === 429);
check("upstream() maps to 502", ApiError.upstream().status === 502);
check("internal() maps to 500", ApiError.internal().status === 500);

check("unauthenticated() has a safe default message", typeof ApiError.unauthenticated().message === "string");
check("code is stable and matches the factory used", ApiError.forbidden().code === "FORBIDDEN");
check("details are preserved when provided", ApiError.validation("bad", { field: "x" }).details?.field === "x");
check("details are undefined when not provided", ApiError.notFound().details === undefined);

check("ApiError is a real Error instance (works with instanceof in try/catch)", ApiError.internal() instanceof Error);

// --- apiOk / apiErrorResponse ---
{
  const res = apiOk({ hello: "world" }, "req-123");
  check("apiOk() defaults to status 200", res.status === 200);
  const body = await res.json();
  check("apiOk() wraps data in the {data, error:null, meta} envelope", body.error === null && body.data.hello === "world");
  check("apiOk() includes the request_id in meta", body.meta.request_id === "req-123");
}
{
  const res = apiOk({ created: true }, "req-456", { status: 201 });
  check("apiOk() respects a custom status", res.status === 201);
}
{
  const err = ApiError.validation("Datos inválidos", { fieldErrors: { nombre: ["Requerido"] } });
  const res = apiErrorResponse(err, "req-789");
  check("apiErrorResponse() uses the ApiError's status", res.status === 400);
  const body = await res.json();
  check("apiErrorResponse() wraps the error in {data:null, error:{code,message}, meta}", body.data === null && body.error.code === "VALIDATION_ERROR" && body.error.message === "Datos inválidos");
  check("apiErrorResponse() includes details when present", JSON.stringify(body.error.details) === JSON.stringify({ fieldErrors: { nombre: ["Requerido"] } }));
  check("apiErrorResponse() includes the request_id in meta", body.meta.request_id === "req-789");
}
{
  const err = ApiError.notFound();
  const res = apiErrorResponse(err, "req-000");
  const body = await res.json();
  check("apiErrorResponse() omits the details key entirely when there are none", !("details" in body.error));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
