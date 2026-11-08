// Unit tests de las pestañas de Configuración (src/lib/configuracion.ts).
// Run: npx tsx tests/unit/configuracion.test.mjs
import {
  PESTANAS_CONFIGURACION,
  hrefConfiguracion,
  parsePestanaConfiguracion,
  pestanasVisibles,
} from "../../src/lib/configuracion.ts";

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

check("hay 4 pestañas con valores únicos", PESTANAS_CONFIGURACION.length === 4 && new Set(PESTANAS_CONFIGURACION.map((p) => p.value)).size === 4);
check("ADMIN/MANAGER ven las 4", pestanasVisibles(true).length === 4);
check("el resto ve 3 y no ve IA", pestanasVisibles(false).length === 3 && !pestanasVisibles(false).some((p) => p.value === "ia"));
check("la pestaña de documentos es propia", pestanasVisibles(false).some((p) => p.value === "documentos"));
check("métricas de valor viven en la pestaña de IA (no en el perfil)", PESTANAS_CONFIGURACION.find((p) => p.value === "ia")?.label.includes("valor") === true);

check("parse: valor válido", parsePestanaConfiguracion("documentos", false) === "documentos");
check("parse: null cae en perfil", parsePestanaConfiguracion(null, true) === "perfil");
check("parse: desconocido cae en perfil", parsePestanaConfiguracion("xyz", true) === "perfil");
check("parse: ia no permitida cae en perfil", parsePestanaConfiguracion("ia", false) === "perfil");
check("parse: ia permitida", parsePestanaConfiguracion("ia", true) === "ia");

check("href inicial sin parámetro", hrefConfiguracion("perfil") === "/configuracion");
check("href de documentos", hrefConfiguracion("documentos") === "/configuracion?tab=documentos");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
