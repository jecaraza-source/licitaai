// P1.3 — guardas de higiene de la suite de pruebas para CI.
//
// Falla (exit 1) si:
//   1. Aparece un `.only` (test.only / it.only / describe.only / .only(...))
//      en cualquier archivo de tests — un `.only` olvidado hace que CI
//      pase ejecutando UNA sola prueba.
//   2. Un archivo de spec entero está deshabilitado con un skip
//      incondicional a nivel de módulo (`test.skip(true, ...)` o un
//      `describe.skip` en la raíz) — equivale a borrar la cobertura sin
//      que se note.
//
// Un `test.skip(condición, "motivo")` con una condición real (sin
// credenciales, solo-local, etc.) SÍ está permitido — es la forma correcta
// de saltar una prueba que no aplica en un entorno dado.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const RAIZ = "tests";
const EXT = /\.(test|spec)\.(mjs|ts|tsx|js)$/;

function archivos(dir) {
  const salida = [];
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) salida.push(...archivos(ruta));
    else if (EXT.test(entrada)) salida.push(ruta);
  }
  return salida;
}

const ONLY_RE = /(^|[^.\w])(?:describe|it|test|bench)\.only\s*\(|\.only\s*\(\s*["'`]/;
const SKIP_INCONDICIONAL_RE =
  /(^|[^.\w])(?:describe|it|test)\.skip\s*\(\s*(?:true\b|["'`])|(^|[^.\w])(?:describe|it|test)\.skip\s*\(\s*\)/m;

let problemas = 0;

for (const archivo of archivos(RAIZ)) {
  const texto = readFileSync(archivo, "utf8");
  const lineas = texto.split("\n");

  lineas.forEach((linea, i) => {
    if (linea.trimStart().startsWith("//")) return;
    if (ONLY_RE.test(linea)) {
      console.error(`✖ ${archivo}:${i + 1} — .only detectado: ${linea.trim()}`);
      problemas++;
    }
  });

  if (SKIP_INCONDICIONAL_RE.test(texto)) {
    console.error(`✖ ${archivo} — skip incondicional a nivel de spec (borra cobertura en silencio)`);
    problemas++;
  }
}

if (problemas > 0) {
  console.error(`\n${problemas} problema(s) de higiene de pruebas.`);
  process.exit(1);
}
console.log("Higiene de pruebas OK — sin .only ni skips incondicionales.");
