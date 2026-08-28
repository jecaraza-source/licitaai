// P2 punch-list B3 — caché de resultados de IA + dedup de embeddings.
//
// Usage:
//   npx supabase start
//   node tests/integration/p2-b3-ai-cache.test.mjs
import { createClient } from "@supabase/supabase-js";
import { LOCAL } from "../helpers/local-supabase.mjs";
import { createHash } from "node:crypto";

const URL = process.env.SUPABASE_URL ?? LOCAL.url;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? LOCAL.serviceRoleKey;
if (URL.includes("supabase.co")) { console.error("local only"); process.exit(1); }

const admin = createClient(URL, SERVICE_KEY);
let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}${detail ? " — " + detail : ""}`); }
}
const rnd = () => Math.random().toString(36).slice(2, 10);
const sha = (s) => createHash("sha256").update(s).digest("hex");

async function main() {
  // ── ai_cache ─────────────────────────────────────────────────────────
  {
    const clave = `${sha("contenido " + rnd())}:analizar-bases:1:claude-haiku-4-5`;

    const { data: miss } = await admin.rpc("ai_cache_buscar", { p_clave: clave });
    check("1. buscar en frío devuelve null (miss)", miss === null);

    await admin.rpc("ai_cache_guardar", {
      p_clave: clave,
      p_resultado: { objeto_contrato: "Servicios de limpieza", nivel_confianza: "ALTO" },
      p_tokens_input: 20000,
      p_tokens_output: 3000,
    });

    const { data: hit } = await admin.rpc("ai_cache_buscar", { p_clave: clave });
    check("2. tras guardar, buscar devuelve el resultado (hit)", hit?.objeto_contrato === "Servicios de limpieza");

    const { data: fila } = await admin.from("ai_cache").select("hits, last_hit_at, tokens_input").eq("clave", clave).single();
    check("3. el hit incrementó hits y fijó last_hit_at", fila.hits === 1 && !!fila.last_hit_at && fila.tokens_input === 20000);

    await admin.rpc("ai_cache_buscar", { p_clave: clave });
    const { data: fila2 } = await admin.from("ai_cache").select("hits").eq("clave", clave).single();
    check("4. un segundo hit vuelve a incrementar", fila2.hits === 2);

    // guardar de nuevo con la misma clave no sobrescribe (on conflict do nothing)
    await admin.rpc("ai_cache_guardar", { p_clave: clave, p_resultado: { objeto_contrato: "OTRO" }, p_tokens_input: 1, p_tokens_output: 1 });
    const { data: hit3 } = await admin.rpc("ai_cache_buscar", { p_clave: clave });
    check("5. guardar con clave existente no sobrescribe", hit3?.objeto_contrato === "Servicios de limpieza");

    await admin.from("ai_cache").delete().eq("clave", clave);
  }

  // ── dedup de embeddings ─────────────────────────────────────────────
  {
    const { data: org } = await admin.from("organizations").insert({ nombre: `Org ${rnd()}` }).select("id").single();
    const { data: lic } = await admin.from("licitaciones").insert({
      organization_id: org.id, numero_expediente: `EXP-${rnd()}`, titulo: "L", institucion: "I",
      tipo: "SERVICIOS", estado_id: "FEDERAL", sistema: "COMPRANET",
    }).select("id").single();
    const { data: doc1 } = await admin.from("documentos").insert({
      licitacion_id: lic.id, tipo_documento: "BASES", nombre: "a.pdf", storage_path: `${lic.id}/a.pdf`,
    }).select("id").single();

    const texto = "Cláusula idéntica de garantía " + rnd();
    const hash = sha(texto);
    const vector = Array.from({ length: 1536 }, (_, i) => (i % 7) / 10);

    // chunk 1: con embedding
    await admin.from("document_chunks").insert({
      documento_id: doc1.id, chunk_index: 0, contenido: texto,
      contenido_sha256: hash, embedding: JSON.stringify(vector),
    });

    const { data: encontrado } = await admin.rpc("embedding_por_hash", { p_hash: hash });
    check("6. embedding_por_hash devuelve un vector para un hash conocido", Array.isArray(JSON.parse(encontrado)) && JSON.parse(encontrado).length === 1536);

    const { data: nada } = await admin.rpc("embedding_por_hash", { p_hash: sha("texto que no existe " + rnd()) });
    check("7. embedding_por_hash devuelve null para un hash desconocido", nada === null);

    // un chunk sin embedding con el mismo hash: embedding_por_hash sigue
    // devolviendo el del chunk 1 (índice parcial where embedding is not null)
    const { data: doc2 } = await admin.from("documentos").insert({
      licitacion_id: lic.id, tipo_documento: "BASES", nombre: "b.pdf", storage_path: `${lic.id}/b.pdf`,
    }).select("id").single();
    await admin.from("document_chunks").insert({
      documento_id: doc2.id, chunk_index: 0, contenido: texto, contenido_sha256: hash, embedding: null,
    });
    const { data: aun } = await admin.rpc("embedding_por_hash", { p_hash: hash });
    check("8. con un chunk nuevo sin embedding, sigue devolviendo el ya calculado", aun !== null);

    await admin.from("organizations").delete().eq("id", org.id);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
