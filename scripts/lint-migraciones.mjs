// P2 · G7 — linter de migraciones destructivas (ADR 0009).
//
// Falla si una migración contiene una sentencia que puede PERDER DATOS de
// forma irreversible sin una marca explícita:
//
//   -- safe: <razón>            (p. ej. tabla/columna creada en esta misma migración)
//   -- expand-contract: <fase>  (parte de una migración en 3 fases)
//
// Convención expand -> migrate -> contract (ver docs/p2/09-entrega-continua.md):
//   1. expand   — añadir lo nuevo (aditivo, reversible)
//   2. migrate  — copiar datos; la app lee de ambos esquemas tras un flag
//   3. contract — quitar lo viejo (marcado `-- expand-contract: contract`)
//
// Solo mira DATA-loss real; DROP FUNCTION/POLICY/INDEX/VIEW (código, no
// datos) y las sentencias dentro de cuerpos de función ($$...$$) se ignoran.
//
//   node scripts/lint-migraciones.mjs
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = "supabase/migrations";
const PELIGROSAS = [
  { re: /\bdrop\s+table\b/i, nombre: "DROP TABLE" },
  { re: /\bdrop\s+column\b/i, nombre: "DROP COLUMN" },
  { re: /\btruncate\b/i, nombre: "TRUNCATE" },
  { re: /\balter\s+column\s+\S+\s+(set\s+data\s+)?type\b/i, nombre: "ALTER COLUMN ... TYPE" },
  { re: /\bdrop\s+constraint\b/i, nombre: "DROP CONSTRAINT" },
];
const MARCAS = /--\s*(safe|expand-contract)\s*:/i;

/** Quita comentarios de línea y contenido de string literals para no
 * disparar por texto dentro de comillas (p. ej. `comment on ... is '...drop table...'`). */
function limpiar(linea) {
  return linea.replace(/--.*$/, "").replace(/'(?:[^']|'')*'/g, "''");
}

let hallazgos = 0;

for (const archivo of readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()) {
  const sql = readFileSync(join(DIR, archivo), "utf8");
  const lineas = sql.split("\n");
  let enBloqueFuncion = false;

  for (let i = 0; i < lineas.length; i++) {
    const cruda = lineas[i];
    // Alterna dentro/fuera de un bloque $$ ... $$
    const dolares = (cruda.match(/\$\$/g) ?? []).length;
    const eraBloqueAntes = enBloqueFuncion;
    if (dolares % 2 === 1) enBloqueFuncion = !enBloqueFuncion;
    if (eraBloqueAntes) continue; // línea dentro de un cuerpo de función

    const linea = limpiar(cruda);
    for (const { re, nombre } of PELIGROSAS) {
      if (!re.test(linea)) continue;

      // Marca en la misma línea o en las 3 anteriores.
      const contexto = lineas.slice(Math.max(0, i - 3), i + 1).join("\n");
      if (MARCAS.test(contexto)) continue;

      // DROP CONSTRAINT con un ADD CONSTRAINT en algún punto posterior del
      // mismo archivo = swap (recrear un CHECK/UNIQUE, típicamente con una
      // migración de datos en medio). Es seguro.
      if (nombre === "DROP CONSTRAINT") {
        const resto = lineas.slice(i + 1).join("\n");
        if (/\badd\s+constraint\b/i.test(resto)) continue;
      }

      hallazgos++;
      console.error(
        `\x1b[31m✖\x1b[0m ${archivo}:${i + 1}  ${nombre}\n   ${cruda.trim()}\n` +
          `   → añade \`-- safe: <razón>\` o \`-- expand-contract: <fase>\` si es intencional y seguro.\n`,
      );
    }
  }
}

if (hallazgos > 0) {
  console.error(`\n${hallazgos} sentencia(s) destructiva(s) sin marcar. Ver docs/p2/09-entrega-continua.md`);
  process.exit(1);
}
console.log("Migraciones OK — ninguna sentencia destructiva de datos sin marcar.");
