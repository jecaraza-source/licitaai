// P2 · H6 — respaldo lógico de Postgres (ADR 0010).
//
// pg_dump -> gzip -> cifrado simétrico (openssl AES-256) -> destino.
// Interino mientras no se apruebe el PITR de Supabase (RPO objetivo con
// esto: 24 h; con PITR: 1 h — ver docs/p2/14-backup-y-restauracion.md).
//
// Requiere en el entorno:
//   SUPABASE_DB_URL       cadena de conexión (rol con SELECT global; NO el
//                         service key — es una URL de Postgres)
//   BACKUP_PASSPHRASE     frase para el cifrado simétrico
// Opcional:
//   BACKUP_DIR            carpeta local de salida (default ./backups)
//   BACKUP_UPLOAD_CMD     comando que recibe la ruta del archivo cifrado
//                         como $1 y lo sube a donde sea (S3, rclone, …).
//                         Sin esto, el backup queda solo en BACKUP_DIR.
//   BACKUP_RETENTION_DAYS podar backups locales más viejos (default 30)
//
//   node scripts/backup-db.mjs
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const DB_URL = process.env.SUPABASE_DB_URL;
const PASS = process.env.BACKUP_PASSPHRASE;
const DIR = process.env.BACKUP_DIR ?? "./backups";
const RETENCION_DIAS = Number(process.env.BACKUP_RETENTION_DAYS ?? "30");

if (!DB_URL || !PASS) {
  console.error("Falta SUPABASE_DB_URL o BACKUP_PASSPHRASE.");
  process.exit(2);
}

function tienen(cmd) {
  return spawnSync(cmd, ["--version"], { stdio: "ignore" }).status === 0;
}
for (const cmd of ["pg_dump", "gzip", "openssl"]) {
  if (!tienen(cmd)) {
    console.error(`No se encontró '${cmd}' en el PATH.`);
    process.exit(2);
  }
}

mkdirSync(DIR, { recursive: true });
const sello = new Date().toISOString().replace(/[:.]/g, "-");
const destino = join(DIR, `licitaai-${sello}.sql.gz.enc`);

console.log(`[backup-db] pg_dump -> gzip -> openssl -> ${destino}`);

// pg_dump | gzip | openssl enc, todo en pipe (sin plano en disco).
const res = spawnSync(
  "bash",
  [
    "-c",
    `set -o pipefail; pg_dump --no-owner --no-privileges "$SUPABASE_DB_URL" ` +
      `| gzip -9 ` +
      `| openssl enc -aes-256-cbc -pbkdf2 -salt -pass env:BACKUP_PASSPHRASE -out "${destino}"`,
  ],
  { stdio: ["ignore", "inherit", "inherit"], env: process.env },
);
if (res.status !== 0) {
  console.error("[backup-db] pg_dump/pipe falló.");
  process.exit(1);
}

const bytes = statSync(destino).size;
if (bytes < 1024) {
  console.error(`[backup-db] el archivo resultante es sospechosamente pequeño (${bytes} B).`);
  process.exit(1);
}
console.log(`[backup-db] OK — ${(bytes / 1024 / 1024).toFixed(1)} MiB cifrados`);

// Verificación: descifrar + gunzip -t (no restaura, solo comprueba integridad).
const verifica = spawnSync(
  "bash",
  ["-c", `openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_PASSPHRASE -in "${destino}" | gunzip -t`],
  { stdio: ["ignore", "inherit", "inherit"], env: process.env },
);
if (verifica.status !== 0) {
  console.error("[backup-db] la verificación de integridad del backup FALLÓ.");
  process.exit(1);
}
console.log("[backup-db] verificación de integridad OK");

if (process.env.BACKUP_UPLOAD_CMD) {
  console.log("[backup-db] subiendo…");
  execFileSync("bash", ["-c", `${process.env.BACKUP_UPLOAD_CMD} "${destino}"`], { stdio: "inherit" });
  console.log("[backup-db] subida OK");
} else {
  console.warn("[backup-db] sin BACKUP_UPLOAD_CMD — el backup queda SOLO en local. " +
    "En prod debe ir a almacenamiento externo en otra región.");
}

// Poda local.
const corte = Date.now() - RETENCION_DIAS * 86400_000;
for (const f of readdirSync(DIR)) {
  if (!f.endsWith(".sql.gz.enc")) continue;
  const ruta = join(DIR, f);
  if (statSync(ruta).mtimeMs < corte) {
    unlinkSync(ruta);
    console.log(`[backup-db] podado ${f}`);
  }
}
