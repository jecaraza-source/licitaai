// P1.8 — verificación de licencias de las dependencias de producción.
//
// Genera el SBOM (CycloneDX) con `npm sbom` y falla si alguna dependencia
// de producción tiene una licencia fuera de la allowlist o sin licencia
// declarada. Las copyleft fuertes (GPL/AGPL/SSPL) bloquean; el resto de la
// allowlist son permisivas estándar.
import { execFileSync } from "node:child_process";

const PERMITIDAS = new Set([
  "MIT", "ISC", "0BSD", "BSD-2-Clause", "BSD-3-Clause", "Apache-2.0",
  "CC0-1.0", "CC-BY-4.0", "Unlicense", "BlueOak-1.0.0", "Python-2.0",
  "MIT-0", "WTFPL",
]);

// Paquetes con licencia fuera de la allowlist pero revisados y aceptados.
// Formato: prefijo "nombre@" (sin versión) para tolerar bumps de patch.
const EXCEPCIONES = [
  // sharp (optimización de imágenes de Next) enlaza libvips como librería
  // nativa dinámica — LGPL-3.0 no obliga a nada en un SaaS que no
  // distribuye el binario. Solo es el artefacto darwin-arm64 (máquinas de
  // desarrollo); en Vercel corre el de linux.
  "@img/sharp-libvips-",
  "@img/sharp-",
  // Sentry CLI (subida de sourcemaps, build-time). FSL-1.1-MIT es
  // source-available y se convierte en MIT a los 2 años; uso interno
  // permitido.
  "@sentry/cli",
  // Paquetes de substack (~2012) sin campo SPDX pero MIT de facto
  // (declarado en su README/history). Transitivos, sin reemplazo directo.
  "buffers@",
  "chainsaw@",
  "traverse@0.3",
];

function licenciaDe(comp) {
  if (!comp.licenses || comp.licenses.length === 0) return null;
  return comp.licenses
    .map((l) => l.license?.id || l.license?.name || l.expression)
    .filter(Boolean)
    .join(" OR ");
}

function normaliza(expr) {
  // "(MIT OR Apache-2.0)" -> ["MIT","Apache-2.0"]
  return expr
    .replace(/[()]/g, "")
    .split(/\s+(?:OR|AND)\s+/i)
    .map((s) => s.trim());
}

const raw = execFileSync("npm", ["sbom", "--sbom-format", "cyclonedx", "--omit", "dev"], {
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});
const sbom = JSON.parse(raw);
const componentes = sbom.components ?? [];

const problemas = [];
for (const comp of componentes) {
  const id = `${comp.name}@${comp.version}`;
  if (EXCEPCIONES.some((pref) => id.startsWith(pref))) continue;
  const expr = licenciaDe(comp);
  if (!expr) {
    problemas.push(`${id} — sin licencia declarada`);
    continue;
  }
  const partes = normaliza(expr);
  // Basta con que UNA opción del OR sea aceptable.
  const ok = partes.some((p) => PERMITIDAS.has(p));
  if (!ok) problemas.push(`${id} — licencia no permitida: ${expr}`);
}

if (problemas.length > 0) {
  console.error(`✖ ${problemas.length} problema(s) de licencias:\n`);
  for (const p of problemas) console.error("  - " + p);
  console.error("\nRevisa y, si procede, añade a EXCEPCIONES en scripts/check-licenses.mjs.");
  process.exit(1);
}
console.log(`Licencias OK — ${componentes.length} dependencias de producción, todas en la allowlist.`);
