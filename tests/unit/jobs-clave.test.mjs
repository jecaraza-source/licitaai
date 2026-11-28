// Unit test de la clave de idempotencia de operaciones de IA encoladas
// (src/lib/jobs.ts): dos pedidos distintos no deben colapsar en el mismo job.
// Run: npx tsx tests/unit/jobs-clave.test.mjs
import { claveIdempotenciaOperacion } from "../../src/lib/jobs.ts";

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

const base = { tipo: "generar-estudio-mercado", recursoId: "lic-1", bucket: 7 };

check(
  "mismo pedido en el mismo bucket → misma clave (el doble clic no duplica)",
  claveIdempotenciaOperacion({ ...base, discriminador: "p1" }) === claveIdempotenciaOperacion({ ...base, discriminador: "p1" }),
);
check(
  "partidas distintas → claves distintas (no se devuelve el job de otra partida)",
  claveIdempotenciaOperacion({ ...base, discriminador: "p1" }) !== claveIdempotenciaOperacion({ ...base, discriminador: "p2" }),
);
check(
  "una partida vs. todas → claves distintas",
  claveIdempotenciaOperacion({ ...base, discriminador: "p1" }) !== claveIdempotenciaOperacion({ ...base, discriminador: "todas" }),
);
check(
  "bucket distinto → clave distinta (un reintento deliberado más tarde sí crea job)",
  claveIdempotenciaOperacion({ ...base, bucket: 7 }) !== claveIdempotenciaOperacion({ ...base, bucket: 8 }),
);
check(
  "documento distinto → clave distinta",
  claveIdempotenciaOperacion({ ...base, documentoId: "d1" }) !== claveIdempotenciaOperacion({ ...base, documentoId: "d2" }),
);
check(
  "campos opcionales ausentes no rompen ni producen 'undefined'/'null'",
  !/undefined|null/.test(claveIdempotenciaOperacion({ ...base, documentoId: null, discriminador: undefined })),
);
check(
  "no hay colisión por desplazamiento entre documento y discriminador",
  claveIdempotenciaOperacion({ ...base, documentoId: "a", discriminador: "" }) !== claveIdempotenciaOperacion({ ...base, documentoId: "", discriminador: "a" }),
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
