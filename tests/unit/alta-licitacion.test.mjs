// Unit tests del alta de licitación en pasos (src/lib/alta-licitacion.ts).
// Run: npx tsx tests/unit/alta-licitacion.test.mjs
import {
  FECHAS_ALTA,
  PASOS_ALTA,
  ULTIMO_PASO_ALTA,
  hrefTrasCrear,
  pasoDeCampo,
  primerPasoConError,
} from "../../src/lib/alta-licitacion.ts";
import { licitacionSchema } from "../../src/lib/validations/licitacion.ts";
import { parsePestana } from "../../src/lib/navegacion.ts";

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

// Cada campo del esquema (menos la casilla de investigación de mercado, que
// vive en el primer paso sin validarse) pertenece a exactamente un paso.
const camposDelEsquema = Object.keys(licitacionSchema.shape).filter((c) => c !== "es_investigacion_mercado");
const camposEnPasos = PASOS_ALTA.flatMap((p) => p.campos);
check(
  "todos los campos del esquema están en algún paso",
  camposDelEsquema.every((c) => camposEnPasos.includes(c)),
  camposDelEsquema.filter((c) => !camposEnPasos.includes(c)).join(","),
);
check("ningún campo está en dos pasos", new Set(camposEnPasos).size === camposEnPasos.length);
check(
  "los pasos solo nombran campos que existen en el esquema",
  camposEnPasos.every((c) => camposDelEsquema.includes(c)),
);
check("hay 3 pasos y el último es opcional", PASOS_ALTA.length === 3 && PASOS_ALTA[ULTIMO_PASO_ALTA].opcional === true);
check("los campos obligatorios están en el primer paso", ["numero_expediente", "institucion", "titulo"].every((c) => PASOS_ALTA[0].campos.includes(c)));
check("las 11 fechas están en el último paso", FECHAS_ALTA.length === 11 && FECHAS_ALTA.every((f) => PASOS_ALTA[ULTIMO_PASO_ALTA].campos.includes(f.name)));

check("pasoDeCampo ubica el expediente en el paso 0", pasoDeCampo("numero_expediente") === 0);
check("pasoDeCampo ubica el monto en el paso 1", pasoDeCampo("monto_maximo") === 1);
check("pasoDeCampo ubica el fallo en el paso 2", pasoDeCampo("fecha_fallo") === 2);
check("pasoDeCampo desconocido cae en 0", pasoDeCampo("otro") === 0);

check("primerPasoConError sin errores es 0", primerPasoConError([]) === 0);
check("primerPasoConError elige el paso más temprano", primerPasoConError(["fecha_fallo", "monto_maximo"]) === 1);

const href = hrefTrasCrear("abc-123");
check("hrefTrasCrear apunta a la ficha en Documentos", href === "/licitaciones/abc-123?tab=documentos");
check("la pestaña de destino existe", parsePestana(new URL(href, "http://x").searchParams.get("tab")) === "documentos");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
