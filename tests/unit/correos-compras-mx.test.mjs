// Unit tests de la lógica pura de la bandeja de correos de Compras MX
// (src/lib/correos-compras-mx.ts).
// Run: npx tsx tests/unit/correos-compras-mx.test.mjs
import {
  MAX_CUERPO,
  direccionDeEntrada,
  esRemitenteGubernamental,
  extraerAlias,
  resumirAdjuntos,
  sugerirLicitacion,
  textoPlano,
} from "../../src/lib/correos-compras-mx.ts";

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

const D = "entrada.licitaai.mx";

// --- alias ---
check("alias: dirección simple", extraerAlias(["acme-3f9a1@entrada.licitaai.mx"], D) === "acme-3f9a1");
check("alias: con nombre y mayúsculas", extraerAlias(["Compras MX <ACME-3f9a1@Entrada.Licitaai.MX>"], D) === "acme-3f9a1");
check("alias: ignora +etiqueta", extraerAlias(["acme-3f9a1+licitacion@entrada.licitaai.mx"], D) === "acme-3f9a1");
check("alias: toma el destinatario del dominio de entrada", extraerAlias(["otro@gmail.com", "acme-3f9a1@entrada.licitaai.mx"], D) === "acme-3f9a1");
check("alias: ningún destinatario del dominio → null", extraerAlias(["otro@gmail.com"], D) === null);
check("alias: dominio parecido no cuenta", extraerAlias(["acme@entrada.licitaai.mx.evil.com", "acme@xentrada.licitaai.mx"], D) === null);
check("alias: basura y dominio vacío → null", extraerAlias(["sin-arroba", "@x.com"], D) === null && extraerAlias(["a@b.c"], "") === null);
check("dirección de entrada", direccionDeEntrada("acme-3f9a1", " Entrada.Licitaai.MX ") === "acme-3f9a1@entrada.licitaai.mx");

// --- remitente ---
check("remitente .gob.mx", esRemitenteGubernamental("Compras MX <noreply@buengobierno.gob.mx>") && esRemitenteGubernamental("a@gob.mx"));
check("remitente no gubernamental", !esRemitenteGubernamental("alguien@gmail.com") && !esRemitenteGubernamental("a@gob.mx.evil.com") && !esRemitenteGubernamental("a@notgob.mx"));

// --- texto plano ---
check("texto: se prefiere la parte de texto", textoPlano("<p>html</p>", "  hola  ") === "hola");
check("texto: sin texto se limpia el HTML", textoPlano("<p>Hola&nbsp;mundo</p><script>alert(1)</script><style>p{}</style><p>Adiós &amp; gracias</p>", null) === "Hola mundo\nAdiós & gracias", JSON.stringify(textoPlano("<p>Hola&nbsp;mundo</p><script>alert(1)</script><style>p{}</style><p>Adiós &amp; gracias</p>", null)));
check("texto: vacío si no hay nada", textoPlano(null, null) === "" && textoPlano("", "   ") === "");
check("texto: se limita la longitud", textoPlano(null, "x".repeat(MAX_CUERPO + 500)).length === MAX_CUERPO);
check("texto: colapsa líneas en blanco", textoPlano(null, "a\n\n\n\n\nb") === "a\n\nb");

// --- sugerencia de licitación ---
const lics = [
  { id: "1", numero_expediente: "LA-006000999-E123-2026" },
  { id: "2", numero_expediente: "IA-009000001-E1-2026" },
  { id: "3", numero_expediente: "AB-1" },
];
check("sugerencia: expediente en el asunto", sugerirLicitacion("Aclaraciones LA-006000999-E123-2026", "", lics) === "1");
check("sugerencia: en el cuerpo, sin guiones ni mayúsculas", sugerirLicitacion("Aviso", "Procedimiento la 006000999 e123 2026 fue notificado", lics) === "1");
check("sugerencia: ninguna coincidencia → null", sugerirLicitacion("Hola", "sin número", lics) === null);
check("sugerencia: dos licitaciones distintas → null", sugerirLicitacion("LA-006000999-E123-2026 e IA-009000001-E1-2026", "", lics) === null);
check("sugerencia: el mismo expediente repetido sigue siendo uno", sugerirLicitacion("LA-006000999-E123-2026", "LA-006000999-E123-2026", lics) === "1");
check("sugerencia: expedientes cortos no se buscan", sugerirLicitacion("AB-1", "AB-1", lics) === null);

// --- adjuntos ---
check("adjuntos: resume y rellena faltantes", JSON.stringify(resumirAdjuntos([{ filename: "bases.pdf", content_type: "application/pdf", size: 10 }, {}])) === JSON.stringify([{ nombre: "bases.pdf", tipo: "application/pdf", tamano: 10 }, { nombre: "sin nombre", tipo: "application/octet-stream", tamano: 0 }]));
check("adjuntos: null → lista vacía", resumirAdjuntos(null).length === 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
