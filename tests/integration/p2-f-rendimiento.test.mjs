// P2 · F — integration: instrumentación y límites de rendimiento
// (migración 20260831000000).
//
//   npx supabase start
//   node tests/integration/p2-f-rendimiento.test.mjs
import { createClient } from "@supabase/supabase-js";
import { LOCAL } from "../helpers/local-supabase.mjs";

const URL = process.env.SUPABASE_URL ?? LOCAL.url;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? LOCAL.serviceRoleKey;

if (URL.includes("supabase.co")) {
  console.error("Refusing to run against a hosted/remote project — local only.");
  process.exit(1);
}

const admin = createClient(URL, SERVICE_KEY);
let pass = 0;
let fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}${detail ? " — " + detail : ""}`); }
}

async function main() {
  // 1. pg_stat_statements habilitada (observabilidad de consultas lentas).
  {
    const { data, error } = await admin.rpc("extension_existe", { p_nombre: "pg_stat_statements" });
    check("1. pg_stat_statements está habilitada", data === true, error?.message);
  }

  // 2. Índices de rendimiento nuevos.
  {
    const { data, error } = await admin.rpc("indices_existen", {
      p_nombres: ["document_chunks_pendientes_idx", "documentos_licitacion_procesado_idx"],
    });
    check("2. los índices de rendimiento nuevos existen", data === true, error?.message);
  }

  // 3. search_chunks: firma intacta + invocable (los SET se verifican por psql
  //    en la migración; aquí basta con que siga funcionando).
  {
    const { data, error } = await admin.rpc("search_chunks", {
      query_embedding: new Array(1536).fill(0.01),
      licitacion_id_param: "00000000-0000-0000-0000-000000000000",
      match_count: 5,
    });
    check("3. search_chunks es invocable y devuelve un array", !error && Array.isArray(data), error?.message);
  }

  // 4. match_count se acota a [1, 50] (evita un limit gigante).
  {
    const { error } = await admin.rpc("search_chunks", {
      query_embedding: new Array(1536).fill(0.01),
      licitacion_id_param: "00000000-0000-0000-0000-000000000000",
      match_count: 100000,
    });
    check("4. search_chunks acepta un match_count grande sin error (se acota internamente)", !error, error?.message);
  }

  // 5. metricas_operacion responde rápido (tiene statement_timeout).
  {
    const t0 = Date.now();
    const { error } = await admin.rpc("metricas_operacion");
    check("5. metricas_operacion responde en < 3s (local)", !error && Date.now() - t0 < 3000, error?.message);
  }

  // 6. RLS: los helpers de introspección no son para usuarios.
  {
    const anon = createClient(URL, process.env.SUPABASE_ANON_KEY ?? LOCAL.anonKey);
    const { error } = await anon.rpc("indices_existen", { p_nombres: ["x"] });
    check("6. indices_existen no es ejecutable por anon", !!error);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
