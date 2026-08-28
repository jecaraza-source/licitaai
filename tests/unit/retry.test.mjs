// P2 · E1 — unit tests para la clasificación de errores y el backoff con
// jitter de _shared/retry.ts.
// Run: npx tsx tests/unit/retry.test.mjs
import { esReintentable, withRetry, ErrorNoReintentable } from "../../supabase/functions/_shared/retry.ts";

let pass = 0;
let fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}${detail ? " — " + detail : ""}`); }
}

// --- esReintentable ---
check("400 no se reintenta", esReintentable({ status: 400 }) === false);
check("401 no se reintenta", esReintentable({ status: 401 }) === false);
check("422 no se reintenta", esReintentable({ status: 422 }) === false);
check("429 se reintenta", esReintentable({ status: 429 }) === true);
check("500 se reintenta", esReintentable({ status: 500 }) === true);
check("503 se reintenta", esReintentable({ status: 503 }) === true);
check("ErrorNoReintentable no se reintenta", esReintentable(new ErrorNoReintentable("x")) === false);
check("error de credencial no se reintenta", esReintentable(new Error("Could not resolve authentication method")) === false);
check("missing API key no se reintenta", esReintentable(new Error("Missing credentials: set OPENAI_API_KEY")) === false);
check("AbortError se reintenta", esReintentable(Object.assign(new Error("aborted"), { name: "AbortError" })) === true);
check("timeout se reintenta", esReintentable(new Error("socket timeout")) === true);
check("overloaded (529) se reintenta", esReintentable(new Error("Overloaded")) === true);
check("error genérico se reintenta por defecto", esReintentable(new Error("algo raro")) === true);

// --- withRetry: no reintenta errores no reintentables ---
{
  let llamadas = 0;
  try {
    await withRetry(async () => { llamadas++; throw { status: 400, message: "bad" }; }, { attempts: 3, baseDelayMs: 1 });
  } catch { /* esperado */ }
  check("withRetry NO reintenta un 400 (1 llamada)", llamadas === 1, `${llamadas} llamadas`);
}

// --- withRetry: reintenta errores reintentables hasta agotar ---
{
  let llamadas = 0;
  try {
    await withRetry(async () => { llamadas++; throw { status: 503, message: "down" }; }, { attempts: 3, baseDelayMs: 1 });
  } catch { /* esperado */ }
  check("withRetry reintenta un 503 hasta attempts (3 llamadas)", llamadas === 3, `${llamadas} llamadas`);
}

// --- withRetry: éxito en el 2º intento ---
{
  let llamadas = 0;
  const r = await withRetry(async () => {
    llamadas++;
    if (llamadas < 2) throw { status: 500 };
    return "ok";
  }, { attempts: 3, baseDelayMs: 1 });
  check("withRetry devuelve el resultado si un intento posterior tiene éxito", r === "ok" && llamadas === 2);
}

// --- withRetry: onRetry se llama por cada reintento ---
{
  const reintentos = [];
  try {
    await withRetry(async () => { throw { status: 500 }; }, {
      attempts: 3, baseDelayMs: 1, onRetry: (n) => reintentos.push(n),
    });
  } catch { /* esperado */ }
  check("withRetry llama onRetry para cada reintento (no para el último fallo)", JSON.stringify(reintentos) === JSON.stringify([1, 2]));
}

// --- withRetry: backoff con jitter está en el rango esperado ---
{
  const inicio = Date.now();
  try {
    await withRetry(async () => { throw { status: 500 }; }, { attempts: 2, baseDelayMs: 100 });
  } catch { /* esperado */ }
  const transcurrido = Date.now() - inicio;
  // 1 reintento: backoff = 100 * 2^0 * [0.5,1) = [50,100)ms
  check("withRetry aplica backoff con jitter (50–160ms para 1 reintento con base 100)", transcurrido >= 45 && transcurrido < 200, `${transcurrido}ms`);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
