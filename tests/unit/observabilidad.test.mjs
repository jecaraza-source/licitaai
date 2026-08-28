// P1.7 — redacción y anonimización para logs y Sentry.
import {
  anonimizarUserId,
  dominioDeEmail,
  redactar,
  sentryBeforeSend,
} from "../../src/lib/observabilidad.ts";

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

check("anonimizarUserId da solo un prefijo", anonimizarUserId("abcdef12-3456-7890-abcd-ef1234567890") === "u_abcdef12");
check("anonimizarUserId con null -> undefined", anonimizarUserId(null) === undefined);
check("dominioDeEmail conserva solo el dominio", dominioDeEmail("Juan.Perez@Empresa.MX") === "empresa.mx");
check("dominioDeEmail sin @ -> undefined", dominioDeEmail("no-es-correo") === undefined);

const red = redactar({
  organization_id: "org-1",
  password: "hunter2",
  nested: { api_key: "sk-123", ok: 1, authorization: "Bearer x" },
  lista: [{ token: "t" }, { seguro: true }],
});
check("redacta password", red.password === "[redactado]");
check("redacta claves anidadas", red.nested.api_key === "[redactado]" && red.nested.authorization === "[redactado]");
check("conserva lo no sensible", red.organization_id === "org-1" && red.nested.ok === 1);
check("redacta dentro de arrays", red.lista[0].token === "[redactado]" && red.lista[1].seguro === true);

const evento = sentryBeforeSend({
  request: { cookies: { s: "1" }, headers: { authorization: "Bearer x" }, data: { password: "p", campo: "v" } },
  extra: { service_role_key: "srk" },
  user: { id: "abcdef12-3456-7890-abcd-ef1234567890", email: "a@b.com", ip_address: "1.2.3.4" },
});
check("sentryBeforeSend quita cookies y headers", evento.request.cookies === undefined && evento.request.headers === undefined);
check("sentryBeforeSend redacta request.data", evento.request.data.password === "[redactado]" && evento.request.data.campo === "v");
check("sentryBeforeSend redacta extra", evento.extra.service_role_key === "[redactado]");
check("sentryBeforeSend reduce el usuario a un prefijo anónimo", evento.user.id === "u_abcdef12" && evento.user.email === undefined);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
