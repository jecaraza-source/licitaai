// Unit tests del webhook de correo entrante (src/app/api/webhooks/correo-entrante/route.ts):
// firma obligatoria y casos que se resuelven sin tocar la base de datos.
// Run: npx tsx tests/unit/correo-entrante-webhook.test.mjs
import { createHmac } from "node:crypto";

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

const SECRETO_BYTES = Buffer.from("secreto-de-prueba-para-el-webhook-0123456789");
const SECRETO = `whsec_${SECRETO_BYTES.toString("base64")}`;

function firmar(id, ts, cuerpo) {
  return "v1," + createHmac("sha256", SECRETO_BYTES).update(`${id}.${ts}.${cuerpo}`).digest("base64");
}
function pedido(cuerpo, { firmaValida = true, conFirma = true } = {}) {
  const id = "msg_test_1";
  const ts = String(Math.floor(Date.now() / 1000));
  const headers = { "content-type": "application/json" };
  if (conFirma) {
    headers["svix-id"] = id;
    headers["svix-timestamp"] = ts;
    headers["svix-signature"] = firmaValida ? firmar(id, ts, cuerpo) : "v1,AAAA";
  }
  return new Request("http://localhost/api/webhooks/correo-entrante", { method: "POST", headers, body: cuerpo });
}
const evento = (type, to) =>
  JSON.stringify({
    type,
    created_at: new Date().toISOString(),
    data: { email_id: "e1", created_at: new Date().toISOString(), from: "a@b.gob.mx", to, bcc: [], cc: [], received_for: to, message_id: "<m@x>", subject: "Hola", attachments: [] },
  });

const { POST } = await import("../../src/app/api/webhooks/correo-entrante/route.ts");

delete process.env.RESEND_WEBHOOK_SECRET;
delete process.env.CORREO_ENTRADA_DOMINIO;
process.env.RESEND_API_KEY = "re_test";
let r = await POST(pedido(evento("email.received", ["x@entrada.licitaai.mx"])));
check("sin configuración responde 503 y no acepta nada", r.status === 503);

process.env.RESEND_WEBHOOK_SECRET = SECRETO;
process.env.CORREO_ENTRADA_DOMINIO = "entrada.licitaai.mx";
r = await POST(pedido(evento("email.received", ["x@entrada.licitaai.mx"]), { conFirma: false }));
check("sin firma responde 401", r.status === 401);
r = await POST(pedido(evento("email.received", ["x@entrada.licitaai.mx"]), { firmaValida: false }));
check("firma inválida responde 401", r.status === 401);

r = await POST(pedido(evento("email.sent", ["x@entrada.licitaai.mx"])));
let j = await r.json();
check("evento de otro tipo se ignora con 200", r.status === 200 && j.ignorado === "tipo", JSON.stringify(j));

r = await POST(pedido(evento("email.received", ["alguien@gmail.com"])));
j = await r.json();
check("correo a una dirección que no es de entrada se ignora con 200", r.status === 200 && j.ignorado === "sin_alias", JSON.stringify(j));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
