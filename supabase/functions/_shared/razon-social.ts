// Razón social mexicana: normalización y comparación que entienden el tipo de
// sociedad escrito completo o abreviado ("SA de CV" = "Sociedad Anónima de
// Capital Variable"). Es TypeScript puro (sin APIs de Deno) para poder
// importarlo desde las Edge Functions y desde las pruebas unitarias.

/**
 * Frases completas de tipo de sociedad (ya sin acentos y en mayúsculas) y la
 * abreviatura a la que equivalen. Se aplican de la más larga a la más corta
 * para que "SOCIEDAD ANONIMA PROMOTORA DE INVERSION" no se confunda con
 * "SOCIEDAD ANONIMA".
 */
const FRASES_SOCIETARIAS: Array<[string, string]> = [
  ["SOCIEDAD ANONIMA PROMOTORA DE INVERSION BURSATIL", "SAPIB"],
  ["SOCIEDAD ANONIMA PROMOTORA DE INVERSION", "SAPI"],
  ["SOCIEDAD ANONIMA BURSATIL", "SAB"],
  ["SOCIEDAD POR ACCIONES SIMPLIFICADA", "SAS"],
  ["SOCIEDAD ANONIMA", "SA"],
  ["SOCIEDAD DE RESPONSABILIDAD LIMITADA MICROINDUSTRIAL", "S DE RL MI"],
  ["SOCIEDAD DE RESPONSABILIDAD LIMITADA", "S DE RL"],
  ["SOCIEDAD EN NOMBRE COLECTIVO", "S EN NC"],
  ["SOCIEDAD EN COMANDITA POR ACCIONES", "S EN C POR A"],
  ["SOCIEDAD EN COMANDITA SIMPLE", "S EN C"],
  ["SOCIEDAD COOPERATIVA DE RESPONSABILIDAD LIMITADA", "SC DE RL"],
  ["SOCIEDAD COOPERATIVA", "SC"],
  ["SOCIEDAD CIVIL", "SC"],
  ["ASOCIACION CIVIL", "AC"],
  ["SOCIEDAD DE SOLIDARIDAD SOCIAL", "SSS"],
  ["SOCIEDAD DE PRODUCCION RURAL", "SPR"],
  ["INSTITUCION DE ASISTENCIA PRIVADA", "IAP"],
  ["DE CAPITAL VARIABLE", "DE CV"],
  ["CAPITAL VARIABLE", "DE CV"],
];
FRASES_SOCIETARIAS.sort((a, b) => b[0].length - a[0].length);

/**
 * Tipo de sociedad ya abreviado al final del nombre, con o sin espacios entre
 * letras ("S.A.P.I. de C.V." llega aquí como "S A P I DE C V"), seguido
 * opcionalmente de "de C.V.". Anclado con \b y $ para no recortar letras
 * sueltas dentro de una palabra ("COSA" no pierde su "SA").
 */
const SUFIJO_SOCIETARIO =
  /(?:\b(?:S ?A ?P ?I ?B|S ?A ?P ?I|S ?A ?B|S ?A ?S|S ?DE ?R ?L(?: ?M ?I)?|S ?EN ?N ?C|S ?EN ?C(?: ?POR ?A)?|S ?P ?R(?: ?DE ?R ?L)?|S ?S ?S|I ?A ?P|S ?C(?: ?DE ?R ?L)?|S ?C ?L|S ?A|A ?C)(?: ?DE ?C ?V)?|\bDE ?C ?V)$/;

function limpiar(v: string | null | undefined): string {
  return (v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9&]+/g, " ")
    .trim();
}

/**
 * Nombre propio de la razón social: mayúsculas, sin acentos ni puntuación y
 * sin el tipo de sociedad final, escrito completo ("SOCIEDAD ANÓNIMA DE
 * CAPITAL VARIABLE") o abreviado ("S.A. de C.V.", "SA de CV", "S. de R.L."…).
 * Conserva los espacios entre palabras.
 */
export function normalizarRazonSocial(v: string | null | undefined): string {
  let texto = ` ${limpiar(v)} `;
  for (const [frase, abreviatura] of FRASES_SOCIETARIAS) {
    texto = texto.split(` ${frase} `).join(` ${abreviatura} `);
  }
  return texto.trim().replace(SUFIJO_SOCIETARIO, "").trim();
}

/** Largo mínimo del nombre propio para aceptar que uno contenga al otro. */
const LARGO_MINIMO_CONTENCION = 4;

/**
 * ¿Son la misma razón social? Compara el nombre propio sin tipo de sociedad ni
 * espacios: "KLARHES, SOCIEDAD ANÓNIMA DE CAPITAL VARIABLE" = "Klarhes SA de CV".
 * Tolera que un nombre contenga al otro ("KLARHES" / "KLARHES MEXICO") solo si
 * el más corto tiene al menos 4 caracteres, para que "AB" no coincida con todo.
 * Un nombre que queda vacío (solo era el tipo de sociedad) nunca coincide.
 */
export function razonesSocialesCoinciden(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const x = normalizarRazonSocial(a).replace(/ /g, "");
  const y = normalizarRazonSocial(b).replace(/ /g, "");
  if (!x || !y) return false;
  if (x === y) return true;
  const [corto, largo] = x.length <= y.length ? [x, y] : [y, x];
  return corto.length >= LARGO_MINIMO_CONTENCION && largo.includes(corto);
}

/**
 * Regla para los prompts de la IA: la comparación fina la hace el sistema por
 * regla, pero cuando la IA razona sobre razones sociales debe saber que el tipo
 * de sociedad escrito completo o abreviado es el mismo dato.
 */
export const EQUIVALENCIAS_RAZON_SOCIAL = `Razones sociales mexicanas — el tipo de sociedad puede venir escrito completo o abreviado y es EL MISMO dato, nunca una diferencia:
- "S.A. de C.V." = "SA de CV" = "Sociedad Anónima de Capital Variable".
- "S.A.P.I. de C.V." = "Sociedad Anónima Promotora de Inversión de Capital Variable"; "S.A.B. de C.V." = "Sociedad Anónima Bursátil de Capital Variable"; "S.A.S." = "Sociedad por Acciones Simplificada".
- "S. de R.L. de C.V." = "Sociedad de Responsabilidad Limitada de Capital Variable"; "S. en N.C." = "Sociedad en Nombre Colectivo"; "S. en C." = "Sociedad en Comandita Simple" (o "por Acciones": "S. en C. por A.").
- "S.C." = "Sociedad Civil" o "Sociedad Cooperativa"; "A.C." = "Asociación Civil"; "I.A.P." = "Institución de Asistencia Privada"; "S.S.S." = "Sociedad de Solidaridad Social"; "S.P.R. de R.L." = "Sociedad de Producción Rural de Responsabilidad Limitada".
Ignora mayúsculas, acentos, puntos y comas. Compara solo el nombre propio (lo que va antes del tipo de sociedad): "KLARHES, SOCIEDAD ANÓNIMA DE CAPITAL VARIABLE" y "Klarhes SA de CV" son la misma razón social. Repórtala como diferencia únicamente si cambia el nombre propio (p. ej. "KLARHES" frente a "KLARES"). Si solo cambia el tipo de sociedad (p. ej. S.A. de C.V. frente a S. de R.L. de C.V.), menciónalo a lo sumo como advertencia menor, nunca como inconsistencia ni pendiente crítico.`;
