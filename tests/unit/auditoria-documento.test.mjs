// Unit tests de la lógica pura de auditar-documento
// (supabase/functions/_shared/auditoria-documento.ts):
// traducción del veredicto del modelo al semáforo y contexto de comparación.
// Run: npx tsx tests/unit/auditoria-documento.test.mjs
import {
  construirContextoAuditoria,
  estadoDesdeAuditoria,
  REGLAS_COMPARACION,
} from "../../supabase/functions/_shared/auditoria-documento.ts";

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

// --- estadoDesdeAuditoria ---
check("valido + VERDE → VERDE", estadoDesdeAuditoria(true, "VERDE", "AMARILLO") === "VERDE");
check("riesgo ROJO → ROJO", estadoDesdeAuditoria(false, "ROJO", "AMARILLO") === "ROJO");
check("valido:true pero riesgo ROJO → ROJO (conservador)", estadoDesdeAuditoria(true, "ROJO", "VERDE") === "ROJO");
check(
  "riesgo AMARILLO llega al semáforo como AMARILLO (antes valido:true→VERDE, valido:false→ROJO)",
  estadoDesdeAuditoria(true, "AMARILLO", "ROJO") === "AMARILLO" &&
    estadoDesdeAuditoria(false, "AMARILLO", "ROJO") === "AMARILLO",
);
check("valido:false con riesgo VERDE (contradicción) → AMARILLO, no ROJO", estadoDesdeAuditoria(false, "VERDE", "VERDE") === "AMARILLO");
check("nivel_riesgo ausente: valido → VERDE", estadoDesdeAuditoria(true, undefined, "AMARILLO") === "VERDE");
check("nivel_riesgo ausente: no valido → AMARILLO", estadoDesdeAuditoria(false, null, "AMARILLO") === "AMARILLO");
check(
  "GRIS (No aplica) nunca se pisa",
  estadoDesdeAuditoria(true, "VERDE", "GRIS") === null && estadoDesdeAuditoria(false, "ROJO", "GRIS") === null,
);

// --- construirContextoAuditoria ---
const ctx = construirContextoAuditoria({
  requisito: { descripcion: "Comprobante de domicilio", categoria: "LEGAL", fundamento_legal: null, vigencia_requerida: "3 meses" },
  fechaEntregaPropuesta: "2026-10-01",
  empresa: { razon_social: "ACME SA", rfc: "ACM010101AAA", representante_legal_nombre: "Juan Pérez López" },
});
check("el contexto incluye el representante legal registrado", ctx.includes("Representante legal registrado: Juan Pérez López"));
check("el contexto incluye RFC y razón social como referencia", ctx.includes("ACM010101AAA") && ctx.includes("ACME SA"));
check("el contexto ya no dice 'deben coincidir' sin matiz", !ctx.includes("deben coincidir"));
check("campos vacíos se muestran como N/D", construirContextoAuditoria({ requisito: null, fechaEntregaPropuesta: null, empresa: null }).includes("Representante legal registrado: N/D"));

// --- reglas del prompt ---
check("las reglas excluyen datos de terceros emisores (CFE, SAT…)", /CFE/.test(REGLAS_COMPARACION) && /terceros/.test(REGLAS_COMPARACION));
check("las reglas mandan comparar personas físicas contra el representante legal", /representante legal registrado/.test(REGLAS_COMPARACION));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
