// P0.6 — validación estructural mínima de salidas de IA.
//
// tool_choice fuerza a Claude a invocar la herramienta indicada, pero eso no
// garantiza que `input` respete el JSON Schema declarado: el SDK no valida
// la respuesta contra el schema, y un modelo puede (por bug, truncamiento,
// o contenido adversarial en el documento fuente) devolver un tipo, enum o
// forma distinta a la esperada. Antes de esta validación, ese `input` se
// guardaba tal cual (con un simple `as` de TypeScript, sin chequeo en
// tiempo de ejecución) directamente en la base de datos. validarContraEsquema
// implementa el subconjunto de JSON Schema que realmente usan los schemas de
// este proyecto (type/enum/properties/required/additionalProperties/items) —
// no es un reemplazo general de ajv, es intencionalmente pequeño.

// deno-lint-ignore no-explicit-any
type JsonSchema = Record<string, any>;

function tipoCoincide(valor: unknown, tipo: string): boolean {
  switch (tipo) {
    case "null":
      return valor === null;
    case "string":
      return typeof valor === "string";
    case "number":
      return typeof valor === "number" && Number.isFinite(valor);
    case "integer":
      return typeof valor === "number" && Number.isInteger(valor);
    case "boolean":
      return typeof valor === "boolean";
    case "array":
      return Array.isArray(valor);
    case "object":
      return typeof valor === "object" && valor !== null && !Array.isArray(valor);
    default:
      return true;
  }
}

/**
 * Valida `valor` contra `schema` de forma recursiva. Devuelve true solo si
 * la forma completa coincide (tipos, enums, required, additionalProperties
 * en objetos, items en arreglos). No lanza — pensado para usarse como
 * compuerta antes de confiar en una salida de IA.
 */
export function validarContraEsquema(valor: unknown, schema: JsonSchema): boolean {
  if (!schema || typeof schema !== "object") return true;

  if (schema.type !== undefined) {
    const tipos = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!tipos.some((t: string) => tipoCoincide(valor, t))) return false;
  }

  if (schema.enum !== undefined) {
    if (!(schema.enum as unknown[]).includes(valor)) return false;
  }

  if (valor === null) return true; // ya pasó el chequeo de type/enum arriba

  if (schema.type === "object" || (schema.properties && typeof valor === "object")) {
    if (typeof valor !== "object" || valor === null || Array.isArray(valor)) return false;
    const obj = valor as Record<string, unknown>;
    const props = (schema.properties ?? {}) as Record<string, JsonSchema>;

    for (const req of (schema.required ?? []) as string[]) {
      if (!(req in obj)) return false;
    }

    if (schema.additionalProperties === false) {
      for (const key of Object.keys(obj)) {
        if (!(key in props)) return false;
      }
    }

    for (const [key, subSchema] of Object.entries(props)) {
      if (key in obj && !validarContraEsquema(obj[key], subSchema)) return false;
    }
  }

  if (schema.type === "array" && schema.items) {
    if (!Array.isArray(valor)) return false;
    for (const item of valor) {
      if (!validarContraEsquema(item, schema.items as JsonSchema)) return false;
    }
  }

  return true;
}
