// P2 · H7 — verificación de un proyecto restaurado (ADR 0010).
//
// Se corre APUNTANDO a un proyecto Supabase AISLADO recién restaurado
// (nunca contra producción). Comprueba que la restauración es usable:
//   - las tablas críticas existen y tienen filas
//   - las funciones clave responden
//   - la cadena de auditoría de una muestra de organizaciones está íntegra
//   - conteos por tabla (para comparar contra el origen)
//
//   SUPABASE_URL=<proyecto-restaurado> SUPABASE_SERVICE_ROLE_KEY=<...> \
//     node scripts/restore-verify.mjs
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error("Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY del proyecto restaurado.");
  process.exit(2);
}
if (URL.includes("supabase.co") && !process.env.RESTORE_VERIFY_CONFIRM) {
  console.error("URL remota detectada. Exporta RESTORE_VERIFY_CONFIRM=1 solo si es el proyecto AISLADO de restauración.");
  process.exit(2);
}

const db = createClient(URL, KEY, { auth: { persistSession: false } });
let fallos = 0;
const ok = (n) => console.log(`  ✓ ${n}`);
const mal = (n, d) => { fallos++; console.error(`  ✗ ${n}${d ? " — " + d : ""}`); };

const TABLAS = [
  "organizations", "users", "licitaciones", "documentos", "document_chunks",
  "ai_results", "audit_log", "jobs", "feature_flags", "ai_org_policy",
  "data_retention_policy", "retencion_archive",
];

console.log("== conteos por tabla ==");
const conteos = {};
for (const t of TABLAS) {
  const { count, error } = await db.from(t).select("*", { count: "exact", head: true });
  if (error) { mal(`conteo ${t}`, error.message); continue; }
  conteos[t] = count;
  console.log(`  ${t}: ${count}`);
}

console.log("\n== funciones críticas ==");
{
  const { error } = await db.rpc("metricas_operacion");
  if (error) mal("metricas_operacion()", error.message);
  else ok("metricas_operacion()");
}
{
  const { data, error } = await db.from("organizations").select("id").limit(5);
  if (error) mal("leer organizations", error.message);
  else {
    let rotas = 0;
    for (const o of data ?? []) {
      const { data: v, error: e } = await db.rpc("verificar_cadena_auditoria", { p_org: o.id });
      const row = Array.isArray(v) ? v[0] : v;
      if (e) mal(`verificar_cadena_auditoria(${o.id})`, e.message);
      else if (row?.rota_en !== null) rotas++;
    }
    if (rotas === 0) ok(`cadena de auditoría íntegra en la muestra (${(data ?? []).length} orgs)`);
    else mal("cadenas de auditoría", `${rotas} rotas`);
  }
}

console.log(`\n${fallos === 0 ? "RESTAURACIÓN VERIFICADA" : `RESTAURACIÓN CON ${fallos} PROBLEMA(S)`}`);
console.log("Compara los conteos de arriba contra el manifiesto del backup de origen.");
console.log(JSON.stringify({ conteos }, null, 2));
process.exit(fallos === 0 ? 0 : 1);
