// P2 B6 — diff estructural de dos valores JSON (comparación de versiones
// de resultados de IA).
import { diffJson, resumenDiff } from "../../src/lib/json-diff.ts";

let pass = 0;
let fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}${detail ? " — " + detail : ""}`); }
}

check("iguales -> sin_cambios", diffJson({ a: 1 }, { a: 1 }).estado === "sin_cambios");

{
  const d = diffJson({ a: 1, b: 2 }, { a: 1, b: 3, c: 4 });
  check("clave modificada", d.hijos.b.estado === "modificado" && d.hijos.b.antes === 2 && d.hijos.b.despues === 3);
  check("clave agregada", d.hijos.c.estado === "agregado" && d.hijos.c.despues === 4);
  check("clave sin cambios", d.hijos.a.estado === "sin_cambios");
}

{
  const d = diffJson({ a: 1, viejo: "x" }, { a: 1 });
  check("clave eliminada", d.hijos.viejo.estado === "eliminado" && d.hijos.viejo.antes === "x");
}

{
  const d = diffJson(
    { secciones: [{ t: "A", ok: true }, { t: "B", ok: false }] },
    { secciones: [{ t: "A", ok: true }, { t: "B", ok: true }, { t: "C", ok: false }] },
  );
  check("array: elemento 1 modificado", d.hijos.secciones.hijos["1"].hijos.ok.estado === "modificado");
  check("array: elemento 2 agregado", d.hijos.secciones.hijos["2"].estado === "agregado");
  check("array: elemento 0 sin cambios", d.hijos.secciones.hijos["0"].estado === "sin_cambios");
}

check(
  "cambio de tipo escalar",
  (() => { const d = diffJson({ n: 5 }, { n: "cinco" }); return d.hijos.n.estado === "modificado" && d.hijos.n.despues === "cinco"; })(),
);

{
  const d = diffJson(
    { nivel: "ALTO", req: ["a", "b", "c"], nota: "vieja" },
    { nivel: "MEDIO", req: ["a", "b"], nota: "vieja", extra: 1 },
  );
  const r = resumenDiff(d);
  // nivel ALTO->MEDIO = 1 modificado; req pierde "c" = 1 eliminado; extra = 1 agregado.
  check("resumen cuenta bien", r.modificados === 1 && r.eliminados === 1 && r.agregados === 1, JSON.stringify(r));
}

check("null vs objeto", diffJson(null, { a: 1 }).estado === "modificado");
check("arrays de distinta longitud, resto igual", (() => {
  const d = diffJson([1, 2, 3], [1, 2]);
  return d.hijos["2"].estado === "eliminado" && d.hijos["0"].estado === "sin_cambios";
})());

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
