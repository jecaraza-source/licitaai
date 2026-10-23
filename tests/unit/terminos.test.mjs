// Unit tests de los términos de uso (src/lib/terminos.ts): que lo que los
// usuarios aceptan sobre IA coincida con lo que la plataforma realmente envía
// (docs/p2/21-flujo-de-datos-ia.md) y que la versión sea válida.
// Run: npx tsx tests/unit/terminos.test.mjs
import { TERMINOS_PUNTOS, TERMINOS_VERSION } from "../../src/lib/terminos.ts";

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

const texto = TERMINOS_PUNTOS.join("\n");

check("la versión tiene formato AAAA-MM-DD y es una fecha real", /^\d{4}-\d{2}-\d{2}$/.test(TERMINOS_VERSION) && !Number.isNaN(Date.parse(TERMINOS_VERSION)), TERMINOS_VERSION);
check("la versión es posterior a la inicial (2026-08-27)", TERMINOS_VERSION > "2026-08-27", TERMINOS_VERSION);
check("hay puntos y ninguno está vacío", TERMINOS_PUNTOS.length >= 3 && TERMINOS_PUNTOS.every((p) => typeof p === "string" && p.trim().length > 20));
check(
  "NO afirma que las propuestas económicas no se envían a los proveedores (sí se envían partidas y precios)",
  !/no se env[ií]an propuestas econ[oó]micas|no compartimos propuestas econ[oó]micas/i.test(texto),
);
check("declara el uso de inteligencia artificial", /inteligencia artificial/i.test(texto));
check("nombra a los dos proveedores", /Anthropic/.test(texto) && /OpenAI/.test(texto));
check("reconoce que se envían partidas y precios de la propuesta económica", /partidas y precios/i.test(texto));
check("aclara que no se envían contraseñas ni llaves/certificados de firma", /no se env[ií]an contrase[nñ]as/i.test(texto) && /firma electr[oó]nica/i.test(texto));
check("remite al aviso de privacidad", /aviso de privacidad/i.test(texto));
check("sigue diciendo que la IA no declara cumplimiento legal definitivo", /no declara de forma autom[aá]tica ni definitiva el cumplimiento legal/i.test(texto));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
