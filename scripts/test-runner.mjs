// Ejecuta secuencialmente un conjunto de archivos *.test.mjs y agrega el
// resultado. Sale con código != 0 si alguno falla.
//
//   node scripts/test-runner.mjs tests/unit
//   node scripts/test-runner.mjs tests/integration
//
// Los tests unitarios se ejecutan con `tsx` (importan .ts); los de
// integración con `node` (solo .mjs / supabase-js). Se detecta por la ruta.
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const dir = resolve(process.argv[2] ?? "tests/unit");
const esUnit = dir.includes("unit");
const runner = esUnit ? ["npx", "tsx"] : ["node"];

const archivos = readdirSync(dir)
  .filter((f) => f.endsWith(".test.mjs"))
  .sort();

if (archivos.length === 0) {
  console.error(`No hay *.test.mjs en ${dir}`);
  process.exit(1);
}

let fallidos = 0;
const inicio = Date.now();

for (const archivo of archivos) {
  const ruta = join(dir, archivo);
  process.stdout.write(`\n\x1b[1m▶ ${archivo}\x1b[0m\n`);
  const res = spawnSync(runner[0], [...runner.slice(1), ruta], {
    stdio: "inherit",
    env: process.env,
  });
  if (res.status !== 0) {
    fallidos++;
    console.error(`\x1b[31m✖ ${archivo} falló (exit ${res.status})\x1b[0m`);
  }
}

const seg = ((Date.now() - inicio) / 1000).toFixed(1);
console.log(
  `\n${archivos.length - fallidos}/${archivos.length} suites OK · ${seg}s`,
);
process.exit(fallidos > 0 ? 1 : 0);
