// Unit tests del ciclo de vida de la licitación (src/lib/estados.ts).
// Run: npx tsx tests/unit/estados.test.mjs
import { ETIQUETAS_ESTADO, etapasOmitidas, pasoPrevio, siguienteEstado, tipoCambioEstado } from "../../src/lib/estados.ts";
import { ESTADOS_LICITACION } from "../../src/lib/validations/licitacion.ts";

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

check("hay etiqueta para cada estado", ESTADOS_LICITACION.every((e) => typeof ETIQUETAS_ESTADO[e] === "string" && ETIQUETAS_ESTADO[e].length > 0));
check("siguienteEstado sigue el orden", siguienteEstado("NUEVA") === "ANALISIS" && siguienteEstado("PREPARACION") === "ENVIADA" && siguienteEstado("SEGUIMIENTO") === "CERRADA");
check("siguienteEstado del último es null", siguienteEstado("CERRADA") === null);

check("tipo: mismo estado no es cambio", tipoCambioEstado("NUEVA", "NUEVA") === null);
check("tipo: avance de un paso", tipoCambioEstado("ANALISIS", "PREPARACION") === "avance");
check("tipo: salto hacia delante", tipoCambioEstado("NUEVA", "PREPARACION") === "salto");
check("tipo: retroceso", tipoCambioEstado("ENVIADA", "ANALISIS") === "retroceso");

check("etapas omitidas en un salto", JSON.stringify(etapasOmitidas("NUEVA", "ENVIADA")) === JSON.stringify(["ANALISIS", "PREPARACION"]));
check("sin etapas omitidas en avance ni retroceso", etapasOmitidas("NUEVA", "ANALISIS").length === 0 && etapasOmitidas("CERRADA", "NUEVA").length === 0);

check("avance normal es directo", pasoPrevio("NUEVA", "ANALISIS", 0) === "directo" && pasoPrevio("ENVIADA", "SEGUIMIENTO", 0) === "directo");
check("enviar con pendientes se bloquea", pasoPrevio("PREPARACION", "ENVIADA", 3) === "bloqueado");
check("enviar sin pendientes pide confirmar el envío", pasoPrevio("PREPARACION", "ENVIADA", 0) === "confirmar-envio");
check("saltar a enviada con pendientes también se bloquea", pasoPrevio("NUEVA", "ENVIADA", 2) === "bloqueado");
check("retroceso pide confirmar", pasoPrevio("SEGUIMIENTO", "PREPARACION", 5) === "confirmar");
check("volver a enviada desde seguimiento no es un envío nuevo", pasoPrevio("SEGUIMIENTO", "ENVIADA", 5) === "confirmar");
check("salto que no llega a enviada pide confirmar", pasoPrevio("NUEVA", "PREPARACION", 0) === "confirmar");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
