// P2 · F2 — presupuesto de tamaño de bundle cliente (gate de CI).
//
// Mide el JS cliente que Next emite en `.next/static/chunks` (gzip) y lo
// compara con perf-budgets.json. No resuelve por ruta (frágil entre
// versiones de Next); atrapa "alguien metió una librería de 900 KB al
// bundle compartido".
//
//   npm run build && node scripts/check-bundle.mjs
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const DIR = ".next/static/chunks";
const budgets = JSON.parse(readFileSync("perf-budgets.json", "utf8"));

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith(".js")) out.push(p);
  }
  return out;
}

const archivos = walk(DIR).map((p) => {
  const raw = readFileSync(p);
  return { p, kb: raw.length / 1024, gz: gzipSync(raw).length / 1024 };
});

const totalGz = archivos.reduce((s, a) => s + a.gz, 0);
const mayor = archivos.reduce((m, a) => (a.gz > m.gz ? a : m), { gz: 0, p: "" });

console.log(`Chunks cliente: ${archivos.length} · total ${totalGz.toFixed(0)} KB gz · mayor ${mayor.gz.toFixed(0)} KB gz (${mayor.p.split("/").pop()})`);

const fallos = [];
if (totalGz > budgets.totalClientJsGzipKB) {
  fallos.push(`total ${totalGz.toFixed(0)} KB gz > presupuesto ${budgets.totalClientJsGzipKB} KB`);
}
if (mayor.gz > budgets.maxChunkGzipKB) {
  fallos.push(`chunk mayor ${mayor.gz.toFixed(0)} KB gz > presupuesto ${budgets.maxChunkGzipKB} KB (${mayor.p})`);
}

// Top 5 chunks para contexto.
archivos.sort((a, b) => b.gz - a.gz);
console.log("Top chunks:");
for (const a of archivos.slice(0, 5)) console.log(`  ${a.gz.toFixed(0)} KB gz  ${a.p.split("/").pop()}`);

if (fallos.length > 0) {
  console.error("\n✖ Presupuesto de bundle excedido:");
  for (const f of fallos) console.error(`  - ${f}`);
  console.error("\nSi el crecimiento es intencional, sube el presupuesto en perf-budgets.json en el mismo PR y explica por qué.");
  process.exit(1);
}
console.log("\n✓ Dentro del presupuesto de bundle.");
