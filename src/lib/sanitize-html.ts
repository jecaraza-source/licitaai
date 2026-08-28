// P1.6 — saneado de HTML por allowlist para el contenido que genera la IA
// (propuesta técnica) antes de que llegue a cualquier cliente o a la
// exportación .docx.
//
// El editor (TipTap/ProseMirror) ya descarta lo que no encaja en su schema
// al parsear, y `html-to-docx.ts` es un parser de allowlist — pero la
// defensa correcta es sanear en el servidor, en la salida del modelo, antes
// de persistir o devolver nada. Este saneador:
//   - conserva solo un conjunto fijo de etiquetas de formato,
//   - elimina TODOS los atributos (ninguna etiqueta permitida los necesita
//     salvo colspan/rowspan en celdas de tabla, que sí se conservan
//     acotados a un entero),
//   - descarta por completo el contenido de <script>/<style>, comentarios y
//     cualquier etiqueta fuera de la lista (conservando su texto).
//
// No se usa una librería (DOMPurify necesita un DOM; no hay dependencia de
// saneado en el proyecto) — el caso es lo bastante acotado (allowlist de
// ~12 etiquetas de bloque/inline, cero atributos libres) para un saneador
// pequeño y auditable.

const ETIQUETAS_PERMITIDAS = new Set([
  "p", "br", "h1", "h2", "h3", "h4",
  "ul", "ol", "li",
  "strong", "b", "em", "i", "u", "s",
  "table", "thead", "tbody", "tr", "td", "th",
  "blockquote", "code", "pre", "hr",
]);

// Etiquetas cuyo contenido completo se elimina (no solo la etiqueta).
const ETIQUETAS_CON_CONTENIDO_PELIGROSO = /<(script|style|iframe|object|embed|noscript)\b[\s\S]*?<\/\1\s*>/gi;

export function sanitizarHtml(html: string): string {
  if (!html) return "";

  let salida = html
    // 1. Elimina script/style/iframe/… junto con su contenido.
    .replace(ETIQUETAS_CON_CONTENIDO_PELIGROSO, "")
    // 2. Elimina comentarios (pueden esconder condicionales de IE, payloads).
    .replace(/<!--[\s\S]*?-->/g, "")
    // 3. Elimina cualquier etiqueta de apertura/cierre restante:
    //    - si está en la allowlist, la re-emite SIN atributos (o solo con
    //      colspan/rowspan acotados en celdas),
    //    - si no, se descarta (su texto interno se conserva).
    .replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (_m, nombre, attrs) => {
      const tag = String(nombre).toLowerCase();
      if (!ETIQUETAS_PERMITIDAS.has(tag)) return "";
      const esCierre = _m.startsWith("</");
      if (esCierre) return `</${tag}>`;

      if ((tag === "td" || tag === "th") && typeof attrs === "string") {
        const span = [];
        const col = /\bcolspan\s*=\s*["']?(\d{1,2})/i.exec(attrs);
        const row = /\browspan\s*=\s*["']?(\d{1,2})/i.exec(attrs);
        if (col) span.push(`colspan="${col[1]}"`);
        if (row) span.push(`rowspan="${row[1]}"`);
        return span.length ? `<${tag} ${span.join(" ")}>` : `<${tag}>`;
      }
      return `<${tag}>`;
    });

  // 4. Neutraliza restos de manejadores/URIs peligrosas en texto plano
  //    (por si algo quedó fuera de una etiqueta).
  salida = salida.replace(/javascript:/gi, "").replace(/\son\w+\s*=/gi, " data-x=");

  return salida.trim();
}
