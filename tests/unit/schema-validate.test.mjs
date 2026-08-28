// P0.6 — unit tests for validarContraEsquema
// (supabase/functions/_shared/schema-validate.ts). This is what stands
// between a Claude tool_use response and the database: tool_choice makes it
// LIKELY the model respects the declared JSON Schema, but the SDK never
// verifies that at runtime, so a malformed/truncated/adversarially-steered
// response could otherwise be persisted as-is.
// Run: npx tsx tests/unit/schema-validate.test.mjs
import { validarContraEsquema } from "../../supabase/functions/_shared/schema-validate.ts";

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

// Mirrors the "generales" section schema from analizar-bases/index.ts.
const SCHEMA_GENERALES = {
  type: "object",
  properties: {
    objeto_contrato: { type: ["string", "null"] },
    tipo_procedimiento: { type: ["string", "null"] },
    monto_maximo_estimado: { type: ["number", "null"] },
    moneda: { type: ["string", "null"] },
    nivel_confianza: { type: "string", enum: ["ALTO", "MEDIO", "BAJO"] },
  },
  required: ["objeto_contrato", "tipo_procedimiento", "monto_maximo_estimado", "moneda", "nivel_confianza"],
  additionalProperties: false,
};

check(
  "valid object with all fields passes",
  validarContraEsquema(
    {
      objeto_contrato: "Servicio de limpieza",
      tipo_procedimiento: "Licitación pública",
      monto_maximo_estimado: 100000,
      moneda: "MXN",
      nivel_confianza: "ALTO",
    },
    SCHEMA_GENERALES,
  ),
);

check(
  "valid object with null-able fields set to null passes",
  validarContraEsquema(
    {
      objeto_contrato: null,
      tipo_procedimiento: null,
      monto_maximo_estimado: null,
      moneda: null,
      nivel_confianza: "BAJO",
    },
    SCHEMA_GENERALES,
  ),
);

check(
  "missing required field fails",
  !validarContraEsquema(
    { objeto_contrato: "X", tipo_procedimiento: "Y", monto_maximo_estimado: 1, moneda: "MXN" },
    SCHEMA_GENERALES,
  ),
);

check(
  "wrong enum value for nivel_confianza fails",
  !validarContraEsquema(
    {
      objeto_contrato: "X",
      tipo_procedimiento: "Y",
      monto_maximo_estimado: 1,
      moneda: "MXN",
      nivel_confianza: "SUPER_ALTO",
    },
    SCHEMA_GENERALES,
  ),
);

check(
  "wrong type (string instead of number) fails",
  !validarContraEsquema(
    {
      objeto_contrato: "X",
      tipo_procedimiento: "Y",
      monto_maximo_estimado: "un millón",
      moneda: "MXN",
      nivel_confianza: "ALTO",
    },
    SCHEMA_GENERALES,
  ),
);

check(
  "additionalProperties:false rejects an injected extra field (e.g. a prompt-injection payload smuggled as a field)",
  !validarContraEsquema(
    {
      objeto_contrato: "X",
      tipo_procedimiento: "Y",
      monto_maximo_estimado: 1,
      moneda: "MXN",
      nivel_confianza: "ALTO",
      ignorar_instrucciones_anteriores: "true",
    },
    SCHEMA_GENERALES,
  ),
);

check(
  "non-object value entirely fails an object schema",
  !validarContraEsquema("esto no es un objeto", SCHEMA_GENERALES),
);

check("null fails when the field isn't nullable", !validarContraEsquema(null, { type: "string" }));
check("null passes when the field is nullable", validarContraEsquema(null, { type: ["string", "null"] }));

// Mirrors the nested array-of-objects schema used for
// documentacion_requerida / criterios_evaluacion / partidas etc.
const SCHEMA_ARRAY_DE_OBJETOS = {
  type: "array",
  items: {
    type: "object",
    properties: {
      criterio: { type: "string" },
      ponderacion_porcentaje: { type: ["number", "null"] },
      descripcion: { type: ["string", "null"] },
    },
    required: ["criterio", "ponderacion_porcentaje", "descripcion"],
    additionalProperties: false,
  },
};

check(
  "valid array of nested objects passes",
  validarContraEsquema(
    [
      { criterio: "Precio", ponderacion_porcentaje: 60, descripcion: null },
      { criterio: "Calidad técnica", ponderacion_porcentaje: 40, descripcion: "Evaluación de propuesta técnica" },
    ],
    SCHEMA_ARRAY_DE_OBJETOS,
  ),
);

check(
  "array containing one malformed item fails the whole array (fail-closed, not best-effort)",
  !validarContraEsquema(
    [
      { criterio: "Precio", ponderacion_porcentaje: 60, descripcion: null },
      { criterio: "Calidad técnica", ponderacion_porcentaje: "cuarenta por ciento", descripcion: null },
    ],
    SCHEMA_ARRAY_DE_OBJETOS,
  ),
);

check("a string passed where an array is expected fails", !validarContraEsquema("no soy un arreglo", SCHEMA_ARRAY_DE_OBJETOS));

check(
  "deeply nested schema (nested required object inside an array item) rejects a missing nested required field",
  !validarContraEsquema(
    [{ tipo: "object", campos_detectados: { rfc: "AAA010101AAA" } }],
    {
      type: "array",
      items: {
        type: "object",
        properties: {
          campos_detectados: {
            type: "object",
            properties: { rfc: { type: ["string", "null"] }, razon_social: { type: ["string", "null"] } },
            required: ["rfc", "razon_social"],
            additionalProperties: false,
          },
        },
        required: ["campos_detectados"],
        additionalProperties: false,
      },
    },
  ),
);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
