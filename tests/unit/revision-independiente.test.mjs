// Unit tests del doble check (Paso 17) y del checklist de liberación ampliado
// (Paso 29): src/lib/revision-independiente.ts y src/lib/liberacion.ts.
// Run: npx tsx tests/unit/revision-independiente.test.mjs
import {
  hashContenidoEconomico,
  motivoRevisionPendiente,
} from "../../src/lib/revision-independiente.ts";
import {
  buildItemsLiberacion,
  ITEMS_LIBERACION_AMPLIADO,
  ITEMS_LIBERACION_DEFAULT,
} from "../../src/lib/liberacion.ts";

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

// --- motivoRevisionPendiente ---
const base = { elaboradoPor: "u-autor", revisorId: "u-rev", revisadoAt: "2026-10-05T10:00:00Z" };
check("revisión completa y vigente → null", motivoRevisionPendiente(base) === null);
check("sin revisor → SIN_REVISOR", motivoRevisionPendiente({ ...base, revisorId: null, revisadoAt: null }) === "SIN_REVISOR");
check(
  "el revisor es el autor → REVISOR_ES_AUTOR (aunque ya haya 'confirmado')",
  motivoRevisionPendiente({ ...base, revisorId: "u-autor" }) === "REVISOR_ES_AUTOR",
);
check("revisor asignado sin confirmar → SIN_CONFIRMAR", motivoRevisionPendiente({ ...base, revisadoAt: null }) === "SIN_CONFIRMAR");
check(
  "autor desconocido (null) no bloquea por 'revisor es autor'",
  motivoRevisionPendiente({ ...base, elaboradoPor: null }) === null,
);
check(
  "económica: hash revisado = hash actual → vigente",
  motivoRevisionPendiente({ ...base, hashRevisado: "abc", hashActual: "abc" }) === null,
);
check(
  "económica: la hoja cambió después de revisar → CONTENIDO_CAMBIO",
  motivoRevisionPendiente({ ...base, hashRevisado: "abc", hashActual: "xyz" }) === "CONTENIDO_CAMBIO",
);
check(
  "técnica: sin hashActual no se compara contenido",
  motivoRevisionPendiente({ ...base, hashRevisado: null }) === null,
);

// --- hashContenidoEconomico ---
const p = (d, c, pu) => ({
  descripcion: d,
  cantidad: c,
  unidad: "pieza",
  precio_unitario_ofertado: pu,
  subtotal: c * pu,
  iva: c * pu * 0.16,
  total: c * pu * 1.16,
});
const cfg = { tipo_precio: "FIJO", incluye_iva: true, moneda: "MXN", condiciones_pago: "30 días", tiempo_entrega_dias: 10, validez_oferta_dias: 60 };
const h1 = hashContenidoEconomico([p("Laptop", 2, 100), p("Mouse", 5, 10)], cfg);
check("hash estable e independiente del orden de captura", h1 === hashContenidoEconomico([p("Mouse", 5, 10), p("Laptop", 2, 100)], cfg));
check("hash cambia si cambia un precio", h1 !== hashContenidoEconomico([p("Laptop", 2, 101), p("Mouse", 5, 10)], cfg));
check("hash cambia si cambia la configuración", h1 !== hashContenidoEconomico([p("Laptop", 2, 100), p("Mouse", 5, 10)], { ...cfg, moneda: "USD" }));
check(
  "números como string (numeric de Postgres) y como number dan el mismo hash",
  h1 ===
    hashContenidoEconomico(
      [p("Laptop", 2, 100), p("Mouse", 5, 10)].map((f) => ({ ...f, cantidad: String(f.cantidad), precio_unitario_ofertado: f.precio_unitario_ofertado.toFixed(2) })),
      cfg,
    ),
);

// --- checklist de liberación ---
const idsBase = ITEMS_LIBERACION_DEFAULT.map((i) => i.id);
const idsAmpliado = ITEMS_LIBERACION_AMPLIADO.map((i) => i.id);
check("el checklist ampliado trae los 15 puntos base (mismos ids)", idsBase.every((id) => idsAmpliado.includes(id)));
check("el checklist ampliado tiene 26 puntos sin ids repetidos", idsAmpliado.length === 26 && new Set(idsAmpliado).size === 26, String(idsAmpliado.length));
check("por defecto (flag apagado) siguen siendo 15 puntos", buildItemsLiberacion([]).length === 15);
const previos = [{ id: "documentos_descargados", label: "x", checked: true }, { id: "version_respaldada", label: "x", checked: true }];
const ampliado = buildItemsLiberacion(previos, false, true);
check(
  "al activar el flag se conservan las marcas existentes y los puntos nuevos quedan sin marcar",
  ampliado.length === 26 &&
    ampliado.find((i) => i.id === "documentos_descargados").checked &&
    ampliado.find((i) => i.id === "version_respaldada").checked &&
    ampliado.filter((i) => !i.checked).length === 24,
);
check(
  "al apagar el flag las marcas de los puntos nuevos no rompen el checklist base",
  buildItemsLiberacion([{ id: "vigencias_coinciden", label: "x", checked: true }], false, false).length === 15,
);
check("investigación de mercado ignora el flag", buildItemsLiberacion([], true, true).every((i) => i.id.startsWith("im_")));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
