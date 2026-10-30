// Unit tests de quién ve el menú "Admin" de la barra lateral
// (src/lib/platform-admin.ts → puedeVerMenuAdmin).
// Run: npx tsx tests/unit/platform-admin.test.mjs
import { puedeVerMenuAdmin } from "../../src/lib/platform-admin.ts";

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

check("un ADMIN de plataforma ve el menú", puedeVerMenuAdmin("ADMIN") === true);
check("un OPERADOR no lo ve (puede entrar a /admin/salud por su dirección)", puedeVerMenuAdmin("OPERADOR") === false);
check("un usuario de organización (sin rol de plataforma) no lo ve", puedeVerMenuAdmin(null) === false && puedeVerMenuAdmin(undefined) === false);
check("un valor inesperado no lo muestra", puedeVerMenuAdmin("admin") === false && puedeVerMenuAdmin("SUPERADMIN") === false && puedeVerMenuAdmin("") === false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
