// Unit tests de la lógica pura del panel "Siguiente paso" (src/lib/siguiente-paso.ts).
// Run: npx tsx tests/unit/siguiente-paso.test.mjs
import {
  compuertaRelevante,
  diasParaEntrega,
  estadoEntrega,
  pasosPendientes,
  pendientesPorGrupo,
  pendientesPorPestana,
  titularSiguientePaso,
} from "../../src/lib/siguiente-paso.ts";

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

const libre = {
  rojos: 0,
  amarillosCriticos: 0,
  pendientesLiberacion: 0,
  itemsLiberacion: [],
  jerarquiaAutorizada: true,
  analisisIaSinRevisar: [],
  gateAprobacionIaActivo: false,
  revisionIndependiente: { activo: false, pendientes: [] },
  bloqueado: false,
};
const con = (cambios) => {
  const g = { ...libre, ...cambios };
  g.bloqueado =
    g.rojos > 0 ||
    g.amarillosCriticos > 0 ||
    g.pendientesLiberacion > 0 ||
    !g.jerarquiaAutorizada ||
    (g.gateAprobacionIaActivo && g.analisisIaSinRevisar.length > 0) ||
    (g.revisionIndependiente.activo && g.revisionIndependiente.pendientes.length > 0);
  return g;
};

// --- pasosPendientes ---
check("compuerta libre → sin pasos", pasosPendientes(libre).length === 0);
const todo = con({
  rojos: 2,
  amarillosCriticos: 1,
  pendientesLiberacion: 3,
  jerarquiaAutorizada: false,
  gateAprobacionIaActivo: true,
  analisisIaSinRevisar: [{ id: "a", tipo_analisis: "BASES", documento_id: null, created_at: "" }],
  revisionIndependiente: {
    activo: true,
    pendientes: [
      { ambito: "TECNICA", motivo: "SIN_REVISOR" },
      { ambito: "ECONOMICA", motivo: "CONTENIDO_CAMBIO" },
    ],
  },
});
const pasos = pasosPendientes(todo);
check("orden: IA, auditoría, revisión técnica, económica, liberación, autorización", pasos.map((p) => p.clave).join(",") === "analisis-ia,auditoria,revision-tecnica,revision-economica,liberacion,autorizacion", pasos.map((p) => p.clave).join(","));
check("cada paso apunta a su pestaña", pasos.map((p) => p.pestana).join(",") === "analisis,auditoria,propuesta-tecnica,propuesta-economica,liberacion,liberacion");
check("rojos y amarillos críticos se juntan en un paso con la suma", pasos[1].cantidad === 3 && pasos[1].texto === "2 requisitos en rojo y 1 crítico en amarillo", pasos[1].texto);
check("singulares", pasosPendientes(con({ rojos: 1 }))[0].texto === "1 requisito en rojo" && pasosPendientes(con({ pendientesLiberacion: 1 }))[0].texto === "1 punto del checklist de liberación sin confirmar");
check("solo amarillos críticos", pasosPendientes(con({ amarillosCriticos: 2 }))[0].texto === "2 críticos en amarillo");
check("la revisión explica el motivo", pasos[2].texto === "La propuesta técnica no tiene revisor asignado" && pasos[3].texto === "La propuesta económica cambió después de la revisión", pasos[2].texto + " / " + pasos[3].texto);
check("sin el flag de IA, los análisis pendientes no cuentan", pasosPendientes(con({ gateAprobacionIaActivo: false, analisisIaSinRevisar: [{ id: "a", tipo_analisis: "X", documento_id: null, created_at: "" }] })).length === 0);
check("sin el flag de revisión, las pendientes no cuentan", pasosPendientes(con({ revisionIndependiente: { activo: false, pendientes: [{ ambito: "TECNICA", motivo: "SIN_REVISOR" }] } })).length === 0);
check("motivo desconocido no rompe", pasosPendientes(con({ revisionIndependiente: { activo: true, pendientes: [{ ambito: "TECNICA", motivo: "NUEVO" }] } }))[0].texto === "La propuesta técnica requiere revisión");

// --- insignias ---
const porPestana = pendientesPorPestana(pasos);
check("pendientes por pestaña suman los de la misma pestaña", porPestana.liberacion === 4 && porPestana.auditoria === 3 && porPestana["propuesta-tecnica"] === 1 && porPestana.analisis === 1, JSON.stringify(porPestana));
const porGrupo = pendientesPorGrupo(pasos);
check("pendientes por grupo", porGrupo.Proceso === 7 && porGrupo.Propuesta === 2 && porGrupo["Análisis"] === 1 && porGrupo.Resumen === undefined && porGrupo.Documentos === undefined, JSON.stringify(porGrupo));
check("sin pendientes no hay insignias", Object.keys(pendientesPorGrupo([])).length === 0);

// --- titular ---
check("titular libre", titularSiguientePaso(libre, []) === "Todo listo para enviar");
check("titular con una cosa", titularSiguientePaso(con({ rojos: 1 }), pasosPendientes(con({ rojos: 1 }))) === "Falta 1 cosa para enviar");
check("titular con varias", titularSiguientePaso(todo, pasos) === "Faltan 6 cosas para enviar");
check("titular no afirma que todo está listo si la compuerta bloquea sin pasos", titularSiguientePaso({ ...libre, bloqueado: true }, []) === "Revisa la compuerta de liberación");

// --- relevancia ---
check("la compuerta importa antes de enviar", ["NUEVA", "ANALISIS", "PREPARACION"].every(compuertaRelevante));
check("y deja de importar después", ["ENVIADA", "SEGUIMIENTO", "CERRADA"].every((e) => !compuertaRelevante(e)));

// --- fecha de entrega (hora de Ciudad de México, UTC-6 sin horario de verano) ---
const hoy = new Date("2026-11-05T18:00:00Z"); // 12:00 en CDMX
check("sin fecha → null", diasParaEntrega(null, hoy) === null && diasParaEntrega("", hoy) === null);
check("fecha inválida → null", diasParaEntrega("no-es-fecha", hoy) === null);
check("el mismo día en CDMX es 0", diasParaEntrega("2026-11-05T23:30:00-06:00", hoy) === 0);
check("23:30 CDMX (05:30Z del día siguiente) sigue siendo el mismo día local", diasParaEntrega("2026-11-06T05:30:00Z", hoy) === 0);
check("mañana", diasParaEntrega("2026-11-06T10:00:00-06:00", hoy) === 1);
check("en diez días", diasParaEntrega("2026-11-15T09:00:00-06:00", hoy) === 10);
check("ayer es -1", diasParaEntrega("2026-11-04T09:00:00-06:00", hoy) === -1);
check("no depende de la hora del día de hoy", diasParaEntrega("2026-11-06T10:00:00-06:00", new Date("2026-11-05T06:30:00Z")) === 1);

check("etiquetas", estadoEntrega(null).etiqueta === "Sin fecha de entrega" && estadoEntrega(0).etiqueta === "Se entrega hoy" && estadoEntrega(1).etiqueta === "Se entrega mañana" && estadoEntrega(5).etiqueta === "Faltan 5 días para la entrega" && estadoEntrega(-1).etiqueta === "Venció hace 1 día" && estadoEntrega(-3).etiqueta === "Venció hace 3 días");
check("tonos", estadoEntrega(-1).tono === "vencida" && estadoEntrega(0).tono === "urgente" && estadoEntrega(3).tono === "urgente" && estadoEntrega(4).tono === "proxima" && estadoEntrega(7).tono === "proxima" && estadoEntrega(8).tono === "holgada" && estadoEntrega(null).tono === "sin-fecha");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
