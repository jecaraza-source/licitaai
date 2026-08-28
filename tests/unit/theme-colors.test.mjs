// P1.6 — los colores de marca de la empresa se interpolan en un <style>
// del layout; deben ser hex estricto o el tema no se aplica (evita
// inyección de CSS a nivel de organización).
import { esHexValido, buildCompanyThemeStyle, mix, contrastText } from "../../src/lib/theme-colors.ts";

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

check("acepta #rrggbb", esHexValido("#1a2b3c"));
check("acepta #rgb", esHexValido("#abc"));
check("rechaza sin #", !esHexValido("1a2b3c"));
check("rechaza payload de inyección", !esHexValido("#fff}@import url('//evil');/*"));
check("rechaza nombre de color", !esHexValido("red"));
check("rechaza null / no-string", !esHexValido(null) && !esHexValido(123));

check(
  "buildCompanyThemeStyle devuelve null con color inválido",
  buildCompanyThemeStyle("#fff} body{display:none}", null) === null,
);
check(
  "buildCompanyThemeStyle devuelve CSS con color válido",
  (buildCompanyThemeStyle("#0a5c36", null) ?? "").includes("--brand-primary: #0a5c36"),
);
check(
  "un color secundario inválido no llega al CSS (se deriva del primario)",
  !(buildCompanyThemeStyle("#0a5c36", "#000}x{y:z}") ?? "").includes("}x{y:z}"),
);

check("mix produce hex", /^#[0-9a-f]{6}$/i.test(mix("#0a5c36", "white", 0.5)));
check("contrastText devuelve blanco o gris oscuro", ["#1a1a1a", "#ffffff"].includes(contrastText("#0a5c36")));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
