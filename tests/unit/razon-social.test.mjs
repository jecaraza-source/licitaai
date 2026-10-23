// Razón social: el tipo de sociedad completo o abreviado es el mismo dato.
// Caso real: Configuración marcaba "no coincide" entre
// "KLARHES, SOCIEDAD ANÓNIMA DE CAPITAL VARIABLE" (el documento) y
// "Klarhes SA de CV" (la empresa activa).
import { readFileSync } from "node:fs";
import {
  normalizarRazonSocial,
  razonesSocialesCoinciden,
  EQUIVALENCIAS_RAZON_SOCIAL,
} from "../../supabase/functions/_shared/razon-social.ts";

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
const igual = (a, b) => razonesSocialesCoinciden(a, b);

// --- el caso reportado ---
check(
  "KLARHES, SOCIEDAD ANÓNIMA DE CAPITAL VARIABLE = Klarhes SA de CV",
  igual("KLARHES, SOCIEDAD ANÓNIMA DE CAPITAL VARIABLE", "Klarhes SA de CV"),
  normalizarRazonSocial("KLARHES, SOCIEDAD ANÓNIMA DE CAPITAL VARIABLE"),
);
check("…y al revés", igual("Klarhes SA de CV", "KLARHES, SOCIEDAD ANÓNIMA DE CAPITAL VARIABLE"));
check(
  "el nombre propio queda sin el tipo de sociedad",
  normalizarRazonSocial("KLARHES, SOCIEDAD ANÓNIMA DE CAPITAL VARIABLE") === "KLARHES" &&
    normalizarRazonSocial("Klarhes SA de CV") === "KLARHES",
);

// --- las demás formas, completas vs abreviadas ---
const PARES = [
  ["Acme S.A. de C.V.", "ACME SOCIEDAD ANÓNIMA DE CAPITAL VARIABLE"],
  ["Acme S.A.", "Acme Sociedad Anónima"],
  ["Acme S.A.P.I. de C.V.", "ACME SOCIEDAD ANÓNIMA PROMOTORA DE INVERSIÓN DE CAPITAL VARIABLE"],
  ["Acme S.A.B. de C.V.", "Acme Sociedad Anónima Bursátil de Capital Variable"],
  ["Acme S.A.S.", "Acme Sociedad por Acciones Simplificada"],
  ["Acme S. de R.L. de C.V.", "ACME SOCIEDAD DE RESPONSABILIDAD LIMITADA DE CAPITAL VARIABLE"],
  ["Acme S. de R.L.", "Acme Sociedad de Responsabilidad Limitada"],
  ["Acme S. de R.L. MI", "Acme Sociedad de Responsabilidad Limitada Microindustrial"],
  ["Acme S. en N.C.", "Acme Sociedad en Nombre Colectivo"],
  ["Acme S. en C.", "Acme Sociedad en Comandita Simple"],
  ["Acme S. en C. por A.", "Acme Sociedad en Comandita por Acciones"],
  ["Acme S.C.", "Acme Sociedad Civil"],
  ["Acme S.C.", "Acme Sociedad Cooperativa"],
  ["Acme S.C. de R.L.", "Acme Sociedad Cooperativa de Responsabilidad Limitada"],
  ["Amigos del Campo A.C.", "AMIGOS DEL CAMPO ASOCIACIÓN CIVIL"],
  ["Acme I.A.P.", "Acme Institución de Asistencia Privada"],
  ["Acme S.S.S.", "Acme Sociedad de Solidaridad Social"],
  ["Acme S.P.R. de R.L.", "Acme Sociedad de Producción Rural de Responsabilidad Limitada"],
];
for (const [a, b] of PARES) check(`"${a}" = "${b}"`, igual(a, b), `${normalizarRazonSocial(a)} | ${normalizarRazonSocial(b)}`);

// --- formatos de escritura de la abreviatura ---
for (const v of ["ACME, S.A. DE C.V.", "Acme SA DE CV", "acme s.a. de c.v", "ACME  S. A.  DE  C. V.", "Acme, SA de C.V."]) {
  check(`variante de escritura: "${v}"`, igual(v, "Acme Sociedad Anónima de Capital Variable"));
}
check("acentos y ñ no estorban", igual("Compañía Ñandú S.A. de C.V.", "COMPANIA NANDU SOCIEDAD ANONIMA DE CAPITAL VARIABLE"));
check("el & se conserva", normalizarRazonSocial("Pérez & Hijos S.A. de C.V.") === "PEREZ & HIJOS");

// --- lo que NO debe coincidir ---
check("cambia el nombre propio → no coincide", !igual("Klarhes SA de CV", "Klares SA de CV"));
check("otra empresa → no coincide", !igual("Klarhes SA de CV", "Constructora Norte SA de CV"));
check("solo difiere el tipo de sociedad → el nombre propio coincide", igual("Acme SA de CV", "Acme S. de R.L. de C.V."));
check("nombre muy corto no coincide por contención ('AB' vs 'ABC')", !igual("AB SA de CV", "ABC SA de CV"));
check("nombre largo sí tolera que uno contenga al otro", igual("Klarhes SA de CV", "Klarhes México SA de CV"));
check("solo el tipo de sociedad (sin nombre) nunca coincide", !igual("SA de CV", "S.A. de C.V.") && !igual("SA de CV", "Klarhes SA de CV"));
check("vacío / null no coincide", !igual("", "Acme SA de CV") && !igual(null, "Acme SA de CV") && !igual("Acme", undefined));

// --- no recorta letras dentro de una palabra ---
check("'COSA' no pierde su SA", normalizarRazonSocial("Comercial COSA") === "COMERCIAL COSA");
check("'CASA' no pierde su SA", normalizarRazonSocial("Casa Blanca SA de CV") === "CASA BLANCA");
check("'MISC' / 'AAC' no pierden letras finales", normalizarRazonSocial("Servicios MISC") === "SERVICIOS MISC" && normalizarRazonSocial("Grupo AAC") === "GRUPO AAC");
check("'DE CV' sin sociedad también se quita", normalizarRazonSocial("Acme de CV") === "ACME");

// --- la regla llega a la IA ---
check("el texto de equivalencias nombra el caso y las formas principales",
  ["Sociedad Anónima de Capital Variable", "S.A.P.I.", "S. de R.L.", "A.C.", "advertencia menor"].every((t) => EQUIVALENCIAS_RAZON_SOCIAL.includes(t)));
const lee = (ruta) => readFileSync(new URL(ruta, import.meta.url), "utf8");
for (const ruta of [
  "../../supabase/functions/analizar-documento-corporativo/index.ts",
  "../../supabase/functions/auditar-expediente/index.ts",
  "../../supabase/functions/_shared/auditoria-documento.ts",
]) {
  check(`el prompt de ${ruta.split("/").slice(-2).join("/")} incluye las equivalencias`, lee(ruta).includes("${EQUIVALENCIAS_RAZON_SOCIAL}"));
}
check("Configuración compara con razonesSocialesCoinciden, no con cadenas",
  lee("../../supabase/functions/analizar-documento-corporativo/index.ts").includes("razonesSocialesCoinciden(razonSocialDetectada, empresa.razon_social)"));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
