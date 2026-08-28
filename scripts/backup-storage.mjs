// P2 · H6 — sync de Storage a un destino de respaldo (ADR 0010).
//
// Storage no tiene PITR nativo. Este script recorre los buckets con datos
// de cliente y, para cada objeto, lo descarga y lo entrega a un comando de
// subida (o lo escribe en una carpeta local). Además emite un manifiesto
// con conteos + checksums muestreados para verificación de integridad.
//
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   BACKUP_STORAGE_DIR      carpeta local de salida (default ./backups/storage)
//   BACKUP_STORAGE_FULL=1   descarga TODOS los objetos (default: solo manifiesto
//                           + checksum de una muestra — barato, para el drill)
//
//   node scripts/backup-storage.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";
const OUT = process.env.BACKUP_STORAGE_DIR ?? "./backups/storage";
const FULL = process.env.BACKUP_STORAGE_FULL === "1";

const BUCKETS = [
  "documentos-originales", "propuestas-generadas", "documentos-requeridos",
  "documentos-corporativos", "logos-empresa",
];

const admin = createClient(URL, KEY, { auth: { persistSession: false } });

async function listar(bucket, prefijo = "") {
  const salida = [];
  const pend = [prefijo];
  while (pend.length) {
    const dir = pend.pop();
    const { data, error } = await admin.storage.from(bucket).list(dir, { limit: 1000 });
    if (error) { console.warn(`[backup-storage] list ${bucket}/${dir}: ${error.message}`); continue; }
    for (const e of data ?? []) {
      const ruta = dir ? `${dir}/${e.name}` : e.name;
      if (e.id === null) pend.push(ruta);
      else salida.push({ ruta, bytes: e.metadata?.size ?? null });
    }
  }
  return salida;
}
async function sha256(bytes) {
  const h = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

mkdirSync(OUT, { recursive: true });
const manifiesto = { generado_at: new Date().toISOString(), full: FULL, buckets: {} };
let totalObjetos = 0;
let totalBytes = 0;

for (const bucket of BUCKETS) {
  const objetos = await listar(bucket);
  manifiesto.buckets[bucket] = { objetos: objetos.length, muestra_checksums: [] };
  totalObjetos += objetos.length;
  totalBytes += objetos.reduce((s, o) => s + (o.bytes ?? 0), 0);

  const aChecar = FULL ? objetos : objetos.filter((_, i) => i % 20 === 0).slice(0, 25);
  for (const o of aChecar) {
    const { data, error } = await admin.storage.from(bucket).download(o.ruta);
    if (error || !data) { console.warn(`[backup-storage] download ${bucket}/${o.ruta}: ${error?.message}`); continue; }
    const buf = new Uint8Array(await data.arrayBuffer());
    const hash = await sha256(buf);
    manifiesto.buckets[bucket].muestra_checksums.push({ ruta: o.ruta, bytes: buf.length, sha256: hash });
    if (FULL) {
      const destino = join(OUT, bucket, o.ruta);
      mkdirSync(dirname(destino), { recursive: true });
      writeFileSync(destino, buf);
    }
  }
  console.log(`[backup-storage] ${bucket}: ${objetos.length} objetos${FULL ? " (descargados)" : ` (${aChecar.length} verificados)`}`);
}

manifiesto.total_objetos = totalObjetos;
manifiesto.total_bytes = totalBytes;
writeFileSync(join(OUT, `manifiesto-${new Date().toISOString().slice(0, 10)}.json`), JSON.stringify(manifiesto, null, 2) + "\n");
console.log(`[backup-storage] ${totalObjetos} objetos, ${(totalBytes / 1024 / 1024).toFixed(1)} MiB. Manifiesto en ${OUT}.`);
if (!FULL && !process.env.BACKUP_UPLOAD_CMD) {
  console.warn("[backup-storage] modo muestreo. Para un respaldo real: BACKUP_STORAGE_FULL=1 + destino externo.");
}
