// Unit tests de la comparación determinista de datos entre documentos
// (supabase/functions/_shared/consistencia-expediente.ts) — Paso 15.
// Run: npx tsx tests/unit/consistencia-expediente.test.mjs
import {
  compararConsistencia,
  documentosComparables,
  normalizarProcedimiento,
  normalizarRazonSocial,
  normalizarRfc,
  tieneEsquemaVigente,
} from "../../supabase/functions/_shared/consistencia-expediente.ts";

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

const REF = { rfc: "ABC010203XY1", razon_social: "Acme Servicios, S.A. de C.V.", numero_procedimiento: "LA-006-2026" };
const doc = (nombre, campos) => ({ nombre, campos });
const campos = (c) => ({ rfc: null, razon_social: null, numero_procedimiento: null, ...c });

// --- normalizadores ---
check("RFC ignora espacios, guiones y minúsculas", normalizarRfc(" abc-010203 xy1 ") === "ABC010203XY1");
check(
  "razón social: S.A. de C.V. / SA DE CV / acentos son lo mismo",
  normalizarRazonSocial("Acme Servicios, S.A. de C.V.") === normalizarRazonSocial("ACME SERVICIOS SA DE CV") &&
    normalizarRazonSocial("Compañía Ñandú S. de R.L. de C.V.") === "COMPANIA NANDU",
  normalizarRazonSocial("Compañía Ñandú S. de R.L. de C.V."),
);
check("razón social: no recorta 'SA' dentro de una palabra", normalizarRazonSocial("Comercial COSA") === "COMERCIAL COSA");
check("procedimiento: separadores no cuentan", normalizarProcedimiento("LA/006.2026") === normalizarProcedimiento("la-006-2026"));

// --- esquema vigente ---
check("campos sin la clave numero_procedimiento = auditoría vieja", !tieneEsquemaVigente({ rfc: "X", razon_social: "Y" }));
check("campos con la clave (aunque sea null) = esquema vigente", tieneEsquemaVigente({ numero_procedimiento: null }));
check("null no es esquema vigente", !tieneEsquemaVigente(null));

// --- sin diferencias ---
check(
  "todo coincide → sin hallazgos",
  compararConsistencia(REF, [
    doc("constancia.pdf", campos({ rfc: "abc010203xy1", razon_social: "ACME SERVICIOS SA DE CV" })),
    doc("propuesta.pdf", campos({ numero_procedimiento: "LA 006 2026", rfc: "ABC010203XY1" })),
  ]).length === 0,
);
check(
  "documentos sin datos extraídos no generan hallazgos",
  compararConsistencia(REF, [doc("ine.pdf", campos({})), doc("poder.pdf", campos({}))]).length === 0,
);

// --- RFC ---
let h = compararConsistencia(REF, [
  doc("constancia.pdf", campos({ rfc: "ABC010203XY1" })),
  doc("acta.pdf", campos({ rfc: "ABC010203XY9" })),
]);
check(
  "RFC distinto entre documentos → inconsistencia",
  h.length === 1 && h[0].campo === "RFC" && h[0].severidad === "inconsistencia" && h[0].documentos.length === 2,
  JSON.stringify(h),
);
h = compararConsistencia(REF, [doc("opinion.pdf", campos({ rfc: "XAXX010101000" }))]);
check(
  "RFC que coincide entre sí pero no con la empresa → inconsistencia",
  h.length === 1 && h[0].campo === "RFC" && h[0].severidad === "inconsistencia",
  JSON.stringify(h),
);
check(
  "sin RFC de referencia solo se compara entre documentos",
  compararConsistencia({ ...REF, rfc: null }, [doc("a.pdf", campos({ rfc: "ABC010203XY1" })), doc("b.pdf", campos({ rfc: "ABC010203XY1" }))]).length === 0,
);

// --- razón social ---
h = compararConsistencia(REF, [doc("acta.pdf", campos({ razon_social: "Acme Servicios" }))]);
check(
  "razón social que solo omite el régimen societario no es hallazgo",
  h.length === 0,
  JSON.stringify(h),
);
h = compararConsistencia(REF, [doc("acta.pdf", campos({ razon_social: "Acme Servicios Integrales del Norte SA de CV" }))]);
check(
  "razón social que contiene a la registrada → advertencia (variante), no inconsistencia",
  h.length === 1 && h[0].severidad === "advertencia",
  JSON.stringify(h),
);
h = compararConsistencia(REF, [doc("acta.pdf", campos({ razon_social: "Constructora Beta SA de CV" }))]);
check(
  "razón social totalmente distinta → inconsistencia",
  h.length === 1 && h[0].campo === "Razón social" && h[0].severidad === "inconsistencia",
  JSON.stringify(h),
);

// --- número de procedimiento ---
h = compararConsistencia(REF, [
  doc("propuesta-tecnica.pdf", campos({ numero_procedimiento: "LA-006-2026" })),
  doc("propuesta-economica.pdf", campos({ numero_procedimiento: "LA-060-2026" })),
]);
check(
  "número de procedimiento distinto entre documentos → inconsistencia",
  h.length === 1 && h[0].campo === "Número de procedimiento" && h[0].severidad === "inconsistencia",
  JSON.stringify(h),
);
h = compararConsistencia(REF, [
  doc("a.pdf", campos({ numero_procedimiento: "LA-50-GYR-2026-N-1" })),
  doc("b.pdf", campos({ numero_procedimiento: "LA-50-GYR-2026-N-1" })),
]);
check(
  "los documentos coinciden entre sí pero no con el folio de la licitación → solo advertencia (el folio puede ser interno)",
  h.length === 1 && h[0].severidad === "advertencia",
  JSON.stringify(h),
);

// --- auditorías con esquema viejo se ignoran ---
check(
  "una auditoría vieja con RFC de un tercero (CFE) no genera falso positivo",
  compararConsistencia(REF, [doc("recibo-cfe.pdf", { rfc: "CSS160330CP7", razon_social: "CFE Suministrador de Servicios Básicos" })]).length === 0,
);
check(
  "documentosComparables cuenta solo esquema vigente",
  documentosComparables([doc("a", campos({})), doc("b", { rfc: "X" }), doc("c", null)]) === 1,
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
