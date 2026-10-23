// Gate de `npm audit` para CI: falla ante vulnerabilidades high/critical de
// dependencias de producción, salvo las que estén en ALLOWLIST. Cada excepción
// lleva advisory, motivo y fecha de revisión; al vencer, el gate vuelve a
// fallar para que se reevalúe en vez de quedar aceptada para siempre.
import { execSync } from "node:child_process";

const ALLOWLIST = [
  {
    advisory: "GHSA-86w9-cpqp-85rv",
    paquete: "node-forge",
    revisar_antes_de: "2026-11-05",
    motivo:
      "Sin versión corregida publicada. El advisory es de VERIFICACIÓN de firmas RSA " +
      "PKCS#1 v1.5, y la verificación ya se hace con node:crypto (src/lib/efirma-servidor.ts); " +
      "forge solo se usa en el navegador para descifrar el .key del SAT y firmar " +
      "(src/lib/efirma.ts). Autorizada por el responsable del proyecto el 2026-10-05. " +
      "Reevaluar al salir un fix o al reemplazar forge en el cliente.",
  },
];

let raw;
try {
  raw = execSync("npm audit --omit=dev --json", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
} catch (e) {
  raw = e.stdout; // npm audit sale con código != 0 cuando hay hallazgos
}
const { vulnerabilities = {} } = JSON.parse(raw);
const hoy = new Date().toISOString().slice(0, 10);
const bloqueantes = [];

for (const [nombre, v] of Object.entries(vulnerabilities)) {
  if (v.severity !== "high" && v.severity !== "critical") continue;
  const advisories = v.via.filter((x) => typeof x === "object").map((x) => (x.url ?? "").split("/").pop());
  // Las vulnerabilidades solo transitivas (via = nombres de paquete) las cubre su origen.
  if (advisories.length === 0) continue;
  const permitido = advisories.every((a) =>
    ALLOWLIST.some((x) => x.advisory === a && x.paquete === nombre && x.revisar_antes_de >= hoy),
  );
  if (!permitido) bloqueantes.push(`${v.severity.toUpperCase()} ${nombre}: ${advisories.join(", ")}`);
}

for (const x of ALLOWLIST) {
  console.log(`excepción vigente hasta ${x.revisar_antes_de}: ${x.paquete} (${x.advisory})`);
}
if (bloqueantes.length) {
  console.error("npm audit: vulnerabilidades high/critical sin excepción:\n  " + bloqueantes.join("\n  "));
  process.exit(1);
}
console.log("npm audit: sin vulnerabilidades high/critical fuera de la lista de excepciones.");
