// P1.2 — integridad y transacciones.
//
// Verifica contra un Postgres real (stack local de Supabase):
//   1. guardar_propuesta_economica() hace el upsert de config + reemplazo
//      de partidas atómicamente.
//   2. Si una partida referencia una partida_id de OTRA licitación, el
//      trigger de consistencia aborta y el estado previo NO se pierde
//      (la transacción del RPC se revierte completa).
//   3. checklist_items / requisitos_tecnicos rechazan un documento_id que
//      pertenece a otra licitación (hueco cross-recurso dentro de la
//      misma organización).
//
// Usage:
//   npx supabase start
//   node tests/integration/p1-integridad.test.mjs
import { createClient } from "@supabase/supabase-js";
import { LOCAL } from "../helpers/local-supabase.mjs";

const URL = process.env.SUPABASE_URL ?? LOCAL.url;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? LOCAL.serviceRoleKey;

if (URL.includes("supabase.co")) {
  console.error("Refusing to run: SUPABASE_URL looks like a hosted/remote project, not local.");
  process.exit(1);
}

const admin = createClient(URL, SERVICE_KEY);

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
const rnd = () => Math.random().toString(36).slice(2, 10);

async function nuevaLicitacion(orgId) {
  const { data, error } = await admin
    .from("licitaciones")
    .insert({
      organization_id: orgId,
      numero_expediente: `EXP-${rnd()}`,
      titulo: `Licitación ${rnd()}`,
      institucion: "Instituto de Prueba",
      tipo: "ADQUISICION",
      estado_id: "FEDERAL",
      sistema: "COMPRANET",
    })
    .select("id")
    .single();
  if (error) throw new Error(`nuevaLicitacion: ${error.message}`);
  return data.id;
}

async function nuevoDocumento(licId) {
  const { data, error } = await admin
    .from("documentos")
    .insert({
      licitacion_id: licId,
      tipo_documento: "BASES",
      nombre: `doc-${rnd()}.pdf`,
      storage_path: `${licId}/${rnd()}.pdf`,
    })
    .select("id")
    .single();
  if (error) throw new Error(`nuevoDocumento: ${error.message}`);
  return data.id;
}

async function main() {
  const { data: org } = await admin
    .from("organizations")
    .insert({ nombre: `Org P1.2 ${rnd()}` })
    .select("id")
    .single();

  const licA = await nuevaLicitacion(org.id);
  const licB = await nuevaLicitacion(org.id);

  // ── 1. guardar_propuesta_economica: upsert de config + partidas ────────
  {
    const { error: e1 } = await admin.rpc("guardar_propuesta_economica", {
      p_licitacion_id: licA,
      p_config: { tipo_precio: "FIJO", incluye_iva: true, moneda: "MXN" },
      p_partidas: [
        { descripcion: "Renglón 1", cantidad: 2, precio_unitario_ofertado: 100, total: 200 },
        { descripcion: "Renglón 2", cantidad: 1, precio_unitario_ofertado: 50, total: 50 },
      ],
    });
    check("1a. guardar_propuesta_economica no falla", !e1, e1?.message);

    const { data: cfg } = await admin
      .from("propuesta_economica_config")
      .select("tipo_precio, moneda")
      .eq("licitacion_id", licA)
      .maybeSingle();
    check("1b. config quedó guardada", cfg?.tipo_precio === "FIJO" && cfg?.moneda === "MXN");

    const { data: filas } = await admin
      .from("propuesta_economica_partidas")
      .select("descripcion")
      .eq("licitacion_id", licA);
    check("1c. se insertaron las 2 partidas", (filas ?? []).length === 2);

    // Segundo guardado: reemplaza, no acumula.
    const { error: e2 } = await admin.rpc("guardar_propuesta_economica", {
      p_licitacion_id: licA,
      p_config: null,
      p_partidas: [{ descripcion: "Único renglón", cantidad: 1, total: 10 }],
    });
    const { data: filas2 } = await admin
      .from("propuesta_economica_partidas")
      .select("descripcion")
      .eq("licitacion_id", licA);
    check("1d. el segundo guardado reemplaza (1 partida, no 3)", !e2 && (filas2 ?? []).length === 1);
  }

  // ── 2. Atomicidad: partida_id de otra licitación → rollback total ──────
  {
    // Una partida real que pertenece a licB.
    const { data: partidaB } = await admin
      .from("partidas")
      .insert({ licitacion_id: licB, numero: "1", descripcion: "Partida de B" })
      .select("id")
      .single();

    const { error } = await admin.rpc("guardar_propuesta_economica", {
      p_licitacion_id: licA,
      p_config: null,
      p_partidas: [
        { descripcion: "válida", cantidad: 1, total: 5 },
        { descripcion: "inválida", partida_id: partidaB.id, cantidad: 1, total: 5 },
      ],
    });
    check("2a. el RPC falla cuando una partida referencia otra licitación", !!error, "no falló");

    const { data: filas } = await admin
      .from("propuesta_economica_partidas")
      .select("descripcion")
      .eq("licitacion_id", licA);
    check(
      "2b. rollback total: la partida previa (1d) sigue intacta, no se aplicó nada del lote fallido",
      (filas ?? []).length === 1 && filas[0].descripcion === "Único renglón",
      `filas: ${JSON.stringify(filas)}`,
    );
  }

  // ── 3. checklist_items / requisitos_tecnicos: documento_id de otra lic ─
  {
    const docB = await nuevoDocumento(licB);

    const { data: item } = await admin
      .from("checklist_items")
      .insert({ licitacion_id: licA, categoria: "LEGAL", descripcion: "Acta constitutiva" })
      .select("id")
      .single();
    const { error: eChecklist } = await admin
      .from("checklist_items")
      .update({ documento_id: docB })
      .eq("id", item.id);
    check("3a. checklist_items rechaza un documento_id de otra licitación", !!eChecklist, "no falló");

    const docA = await nuevoDocumento(licA);
    const { error: eOk } = await admin
      .from("checklist_items")
      .update({ documento_id: docA })
      .eq("id", item.id);
    check("3b. checklist_items acepta un documento_id de su propia licitación", !eOk, eOk?.message);

    const { error: eReq } = await admin.from("requisitos_tecnicos").insert({
      licitacion_id: licA,
      requisito: "Requisito con doc ajeno",
      documento_id: docB,
    });
    check("3c. requisitos_tecnicos rechaza un documento_id de otra licitación", !!eReq, "no falló");
  }

  // cleanup
  await admin.from("organizations").delete().eq("id", org.id);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
