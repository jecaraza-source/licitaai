// P2 · H6 — snapshot versionado de la configuración operativa (ADR 0010).
//
// `feature_flags`, `ai_org_policy`, `ai_model_pricing`, `data_retention_policy`
// no viven en migraciones (cambian en caliente). Este script las vuelca a
// un JSON en el repo para que un restore parta de la config correcta y para
// tener historial en git.
//
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (o los defaults de local)
//   node scripts/backup-config.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";
const OUT_DIR = "supabase/config-snapshot";

const TABLAS = {
  feature_flags: "key",
  ai_model_pricing: "modelo",
  ai_org_policy: "organization_id",
  data_retention_policy: "recurso",
};

const admin = createClient(URL, KEY, { auth: { persistSession: false } });

const snapshot = { generado_at: new Date().toISOString(), fuente: URL, tablas: {} };
for (const [tabla, orden] of Object.entries(TABLAS)) {
  const { data, error } = await admin.from(tabla).select("*").order(orden);
  if (error) {
    console.error(`[backup-config] ${tabla}: ${error.message}`);
    process.exit(1);
  }
  snapshot.tablas[tabla] = data ?? [];
  console.log(`[backup-config] ${tabla}: ${(data ?? []).length} filas`);
}

// ai_org_policy y ai_model_pricing pueden traer datos por-organización;
// el snapshot es para restore, no para compartir — se versiona en el repo
// privado. feature_flags/data_retention_policy son de plataforma.
mkdirSync(OUT_DIR, { recursive: true });
const sello = new Date().toISOString().slice(0, 10);
writeFileSync(join(OUT_DIR, `${sello}.json`), JSON.stringify(snapshot, null, 2) + "\n");
writeFileSync(join(OUT_DIR, "latest.json"), JSON.stringify(snapshot, null, 2) + "\n");
console.log(`[backup-config] escrito ${OUT_DIR}/${sello}.json + latest.json`);
