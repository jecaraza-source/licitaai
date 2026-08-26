// P1.1 — unit tests for the Zod-based route param/query/body validators
// (src/lib/api/validate.ts) that every migrated API route uses instead of
// ad-hoc `typeof` checks.
// Run: npx tsx tests/unit/api-validate.test.mjs
import { z } from "zod";
import { validarParams, validarQuery, validarBody } from "../../src/lib/api/validate.ts";
import { ApiError } from "../../src/lib/api/errors.ts";

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

// --- validarParams ---
{
  const schema = z.object({ id: z.string().uuid() });
  const data = validarParams(schema, { id: "550e8400-e29b-41d4-a716-446655440000" });
  check("validarParams() accepts a valid UUID param", data.id === "550e8400-e29b-41d4-a716-446655440000");
}
{
  const schema = z.object({ id: z.string().uuid() });
  try {
    validarParams(schema, { id: "not-a-uuid" });
    check("validarParams() rejects a malformed UUID", false, "did not throw");
  } catch (e) {
    check("validarParams() rejects a malformed UUID", e instanceof ApiError && e.code === "VALIDATION_ERROR");
  }
}

// --- validarQuery ---
{
  const schema = z.object({ page: z.coerce.number().int().min(1).default(1) });
  const data = validarQuery(schema, new URLSearchParams("page=3"));
  check("validarQuery() coerces a numeric string query param", data.page === 3);
}
{
  const schema = z.object({ page: z.coerce.number().int().min(1).default(1) });
  const data = validarQuery(schema, new URLSearchParams(""));
  check("validarQuery() applies defaults when a param is absent", data.page === 1);
}
{
  const schema = z.object({ estado: z.enum(["NUEVA", "CERRADA"]) });
  try {
    validarQuery(schema, new URLSearchParams("estado=NO_EXISTE"));
    check("validarQuery() rejects a value outside the enum", false, "did not throw");
  } catch (e) {
    check("validarQuery() rejects a value outside the enum", e instanceof ApiError && e.status === 400);
  }
}

// --- validarBody ---
{
  const schema = z.object({ titulo: z.string().min(1) });
  const req = new Request("http://x/api", {
    method: "POST",
    body: JSON.stringify({ titulo: "Hola" }),
    headers: { "content-type": "application/json" },
  });
  const data = await validarBody(schema, req);
  check("validarBody() accepts and parses a valid JSON body", data.titulo === "Hola");
}
{
  const schema = z.object({ titulo: z.string().min(1) });
  const req = new Request("http://x/api", { method: "POST", body: "not json {{{", headers: { "content-type": "application/json" } });
  try {
    await validarBody(schema, req);
    check("validarBody() rejects malformed JSON with a controlled ApiError, not an uncaught exception", false, "did not throw");
  } catch (e) {
    check("validarBody() rejects malformed JSON with a controlled ApiError, not an uncaught exception", e instanceof ApiError && e.code === "VALIDATION_ERROR");
  }
}
{
  const schema = z.object({ titulo: z.string().min(1) });
  const req = new Request("http://x/api", { method: "POST", body: JSON.stringify({}), headers: { "content-type": "application/json" } });
  try {
    await validarBody(schema, req);
    check("validarBody() rejects a body missing a required field", false, "did not throw");
  } catch (e) {
    check(
      "validarBody() rejects a body missing a required field",
      e instanceof ApiError && e.code === "VALIDATION_ERROR" && e.details?.fieldErrors?.titulo?.length > 0,
    );
  }
}
{
  const schema = z.object({ titulo: z.string() });
  const req = new Request("http://x/api", {
    method: "POST",
    body: JSON.stringify({ titulo: "x" }),
    headers: { "content-type": "application/json", "content-length": String(50 * 1024 * 1024) },
  });
  try {
    await validarBody(schema, req);
    check("validarBody() rejects a request whose declared Content-Length exceeds the max, before parsing", false, "did not throw");
  } catch (e) {
    check(
      "validarBody() rejects a request whose declared Content-Length exceeds the max, before parsing",
      e instanceof ApiError && e.code === "PAYLOAD_TOO_LARGE",
    );
  }
}
{
  // Unknown/extra fields: Zod's default behavior strips them rather than
  // erroring (the brief calls for explicit rejection OR removal — this
  // documents which one this schema style does by default).
  const schema = z.object({ titulo: z.string() });
  const req = new Request("http://x/api", {
    method: "POST",
    body: JSON.stringify({ titulo: "x", campo_no_declarado: "inyectado" }),
    headers: { "content-type": "application/json" },
  });
  const data = await validarBody(schema, req);
  check("validarBody() strips unknown fields not declared in the schema by default (z.object default behavior)", !("campo_no_declarado" in data));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
