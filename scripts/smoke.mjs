// Smoke test post-despliegue. Comprueba que la app arranca y sus
// dependencias críticas responden. No requiere credenciales.
//
//   node scripts/smoke.mjs https://staging.licitaai.example
//
// Si el deploy tiene la protección de Vercel activa (previews *.vercel.app),
// exporta VERCEL_AUTOMATION_BYPASS_SECRET para saltarla.
import process from "node:process";

const base = (process.argv[2] ?? process.env.SMOKE_URL ?? "").replace(/\/$/, "");
if (!base) {
  console.error("Uso: node scripts/smoke.mjs <base-url>");
  process.exit(2);
}

const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
/** Añade el bypass de protección de Vercel como query param. */
const u = (path) => {
  if (!BYPASS) return `${base}${path}`;
  const sep = path.includes("?") ? "&" : "?";
  return `${base}${path}${sep}x-vercel-protection-bypass=${BYPASS}`;
};

let fallos = 0;
async function check(nombre, fn) {
  try {
    await fn();
    console.log(`✓ ${nombre}`);
  } catch (e) {
    fallos++;
    console.error(`✗ ${nombre} — ${e.message}`);
  }
}

await check("GET /api/health -> 200 ok", async () => {
  const r = await fetch(u("/api/health"));
  if (r.status !== 200) throw new Error(`status ${r.status}`);
  const b = await r.json();
  if (b.status !== "ok") throw new Error(`body ${JSON.stringify(b)}`);
});

await check("GET /api/ready -> no 503", async () => {
  const r = await fetch(u("/api/ready"));
  const b = await r.json().catch(() => ({}));
  if (r.status === 503) throw new Error(`readiness fail: ${JSON.stringify(b.checks ?? b)}`);
  if (b.checks?.postgres !== "ok") throw new Error(`postgres: ${b.checks?.postgres}`);
  if (b.checks?.storage !== "ok") throw new Error(`storage: ${b.checks?.storage}`);
});

await check("GET /login -> 200", async () => {
  const r = await fetch(u("/login"));
  if (r.status !== 200) throw new Error(`status ${r.status}`);
});

await check("GET / (sin sesión) -> redirige a /login", async () => {
  const r = await fetch(u("/"), { redirect: "manual" });
  const loc = r.headers.get("location") ?? "";
  if (![200, 307, 302].includes(r.status)) throw new Error(`status ${r.status}`);
  if ((r.status === 307 || r.status === 302) && !loc.includes("/login")) {
    throw new Error(`redirige a ${loc}`);
  }
});

console.log(fallos === 0 ? "\nSmoke OK" : `\n${fallos} check(s) fallaron`);
process.exit(fallos > 0 ? 1 : 0);
