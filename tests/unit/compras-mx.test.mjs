// Proceso operativo Compras MX — Pasos 1–3 (constantes y regla de cierre
// interno) y §28 (trazabilidad por requisito).
import { readFileSync } from "node:fs";
import {
  CARPETAS_EXPEDIENTE,
  EVENTOS_CRITICOS,
  validarCierreInterno,
} from "../../src/lib/compras-mx.ts";
import { PREGUNTAS, respuestasTrazabilidad, preguntasRespondidas } from "../../src/lib/trazabilidad.ts";

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

// --- Paso 1: cierre interno anterior al límite oficial ---
const LIMITE = "2026-10-20T18:00:00-06:00";
check("cierre anterior al límite es válido", validarCierreInterno("2026-10-19T12:00:00-06:00", LIMITE) === null);
check("cierre igual al límite se rechaza", validarCierreInterno(LIMITE, LIMITE) !== null);
check("cierre posterior al límite se rechaza", validarCierreInterno("2026-10-21T09:00:00-06:00", LIMITE) !== null);
// 18:00-06:00 == 2026-10-21T00:00Z. Comparar como texto daría el resultado contrario.
check("compara instantes, no texto: 23:00Z es antes del límite", validarCierreInterno("2026-10-20T23:00:00Z", LIMITE) === null);
check("compara instantes, no texto: 01:00Z del día siguiente es después", validarCierreInterno("2026-10-21T01:00:00Z", LIMITE) !== null);
check("sin cierre interno no hay error", validarCierreInterno(null, LIMITE) === null);
check("sin fecha límite no hay error", validarCierreInterno("2026-10-19T12:00:00Z", null) === null);
check("fecha ilegible no se trata como error", validarCierreInterno("no-es-fecha", LIMITE) === null);

// --- Paso 2: la lista de carpetas debe coincidir con el CHECK de la migración ---
const sql = readFileSync(
  new URL("../../supabase/migrations/20261006010000_compras_mx_cierre_brechas.sql", import.meta.url),
  "utf8",
);
const bloque = sql.slice(sql.indexOf("documentos_carpeta_check"));
const enSql = [...bloque.slice(0, bloque.indexOf(";")).matchAll(/'(\d\d_[A-Z_]+)'/g)].map((m) => m[1]);
const enCodigo = CARPETAS_EXPEDIENTE.map((c) => c.value);
check("hay 11 carpetas", enCodigo.length === 11);
check("carpetas del código == CHECK de la migración (mismo orden)", JSON.stringify(enSql) === JSON.stringify(enCodigo), `sql=${enSql.length}`);
check("prefijos 01..11 consecutivos", enCodigo.every((v, i) => v.startsWith(String(i + 1).padStart(2, "0") + "_")));

// --- Paso 3: eventos críticos ---
check("7 eventos críticos, campos únicos", new Set(EVENTOS_CRITICOS.map((e) => e.campo)).size === 7);
check("la presentación de propuesta sugiere cierre interno anticipado",
  EVENTOS_CRITICOS.find((e) => e.campo === "fecha_entrega_propuesta")?.accionSugerida === "Cierre interno anticipado");

// --- §28: trazabilidad ---
const completo = {
  id: "1",
  descripcion: "Acta constitutiva",
  estado: "VERDE",
  padre_id: null,
  fuente: "Convocatoria, p. 8",
  observaciones: "Copia certificada",
  documento_id: "d1",
  cargado_compras_mx: true,
  coincide_compras_mx: true,
  documentos: { nombre: "acta.pdf" },
  responsable: { nombre: "Ana" },
};
check("hay 7 preguntas", PREGUNTAS.length === 7);
check("requisito completo responde las 7", preguntasRespondidas(completo) === 7);
const vacio = { ...completo, fuente: null, observaciones: null, documentos: null, documento_id: null, responsable: null, cargado_compras_mx: false, coincide_compras_mx: false };
check("requisito vacío solo responde ¿Qué exige?", preguntasRespondidas(vacio) === 1);
check("'No' cargado/coincide no cuenta como respondida",
  preguntasRespondidas({ ...completo, cargado_compras_mx: false }) === 6 &&
  preguntasRespondidas({ ...completo, coincide_compras_mx: false }) === 6);
check("espacios en blanco no cuentan como respuesta", preguntasRespondidas({ ...completo, fuente: "   " }) === 6);
check("¿Con qué se acredita? cae al documento si no hay observaciones",
  respuestasTrazabilidad({ ...completo, observaciones: null }).con_que === "acta.pdf");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
