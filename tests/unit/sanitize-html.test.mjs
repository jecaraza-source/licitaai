// P1.6 — saneado de HTML por allowlist para la salida de IA.
import { sanitizarHtml, soloTexto } from "../../src/lib/sanitize-html.ts";

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

check(
  "conserva las etiquetas de formato permitidas",
  sanitizarHtml("<h2>Título</h2><p>Un <strong>párrafo</strong> con <em>énfasis</em>.</p>") ===
    "<h2>Título</h2><p>Un <strong>párrafo</strong> con <em>énfasis</em>.</p>",
);

check(
  "elimina <script> y su contenido",
  !sanitizarHtml('<p>ok</p><script>fetch("//evil")</script>').includes("evil"),
);

check(
  "elimina <style> y su contenido",
  !sanitizarHtml('<style>body{display:none}</style><p>ok</p>').toLowerCase().includes("display:none"),
);

check(
  "quita atributos de una etiqueta permitida (incl. onerror)",
  sanitizarHtml('<p onclick="alert(1)" style="x">hola</p>') === "<p>hola</p>",
);

check(
  "descarta una etiqueta no permitida pero conserva su texto",
  sanitizarHtml("<div><a href=\"javascript:alert(1)\">enlace</a></div>") === "enlace",
);

check(
  "neutraliza javascript: en texto suelto",
  !sanitizarHtml("texto javascript:alert(1) más texto").includes("javascript:"),
);

check(
  "conserva colspan/rowspan acotados en celdas",
  sanitizarHtml('<table><tr><td colspan="2" onclick="x">a</td></tr></table>') ===
    '<table><tr><td colspan="2">a</td></tr></table>',
);

check(
  "un colspan no numérico se descarta",
  sanitizarHtml('<td colspan="abc">x</td>') === "<td>x</td>",
);

check("cadena vacía -> cadena vacía", sanitizarHtml("") === "");

check(
  "elimina comentarios HTML",
  !sanitizarHtml("<!-- [if IE]><script>x</script><![endif] --><p>ok</p>").includes("<!--"),
);

check(
  "img (no permitida) se descarta por completo",
  sanitizarHtml('<p>antes</p><img src="x" onerror="alert(1)"><p>después</p>') ===
    "<p>antes</p><p>después</p>",
);

// Sanitización multi-carácter incompleta (CodeQL js/incomplete-multi-character-sanitization)
check(
  "no se puede reconstruir <script> anidando (<scr<script>ipt>)",
  !/<script>/i.test(sanitizarHtml("<scr<script>ipt>alert(1)</scr</script>ipt>")),
);
check(
  "javascript: entrelazado no sobrevive (javajavascript:script:)",
  !sanitizarHtml("<p>javajavascript:script:alert(1)</p>").includes("javascript:"),
);
check(
  "on-handler entrelazado no sobrevive",
  !/\son\w+=/i.test(sanitizarHtml('<p oonnclick="x" onclick="y">t</p>')),
);

// soloTexto
check("soloTexto quita todas las etiquetas", soloTexto("<p>Hola <strong>mundo</strong></p>") === "Hola mundo");
check("soloTexto es robusto ante <a<b>c> (no deja brackets)", !/[<>]/.test(soloTexto("x<a<b>c>y")));
check("soloTexto convierte &nbsp; en espacio", soloTexto("a&nbsp;b") === "a b");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
