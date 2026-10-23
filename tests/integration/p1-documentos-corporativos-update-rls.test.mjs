// Regresión: documentos_corporativos no tenía política de UPDATE, así que el
// PATCH que confirma manualmente un documento (discrepancia_autorizada)
// actualizaba 0 filas y la ruta respondía 500.
//
// Usage:
//   npx supabase start
//   node tests/integration/p1-documentos-corporativos-update-rls.test.mjs
import { admin, crearOrganizacionesAyB } from "../helpers/fixtures.mjs";

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

async function discrepancia(id) {
  const { data } = await admin.from("documentos_corporativos").select("discrepancia_autorizada").eq("id", id).single();
  return data?.discrepancia_autorizada;
}

async function main() {
  const { a, b, limpiar } = await crearOrganizacionesAyB();
  try {
    const { data: empresa } = await admin
      .from("empresa_perfil")
      .insert({ organization_id: a.orgId, razon_social: "Empresa A" })
      .select("id")
      .single();
    const { data: doc } = await admin
      .from("documentos_corporativos")
      .insert({
        empresa_perfil_id: empresa.id,
        organization_id: a.orgId,
        tipo: "Identificación oficial",
        nombre: "ine.pdf",
        storage_path: "x/ine.pdf",
      })
      .select("id")
      .single();

    // 1. Un rol con escritura de la misma organización puede actualizar.
    const analyst = await a.cliente("ANALYST");
    const { data: upd, error: updErr } = await analyst
      .from("documentos_corporativos")
      .update({ discrepancia_autorizada: true })
      .eq("id", doc.id)
      .select("id, discrepancia_autorizada")
      .single();
    check(
      "1. ANALYST de la org dueña puede confirmar (UPDATE)",
      !updErr && upd?.discrepancia_autorizada === true,
      updErr?.message,
    );

    // 2. VIEWER no puede escribir.
    const viewer = await a.cliente("VIEWER");
    await viewer.from("documentos_corporativos").update({ discrepancia_autorizada: false }).eq("id", doc.id);
    check("2. VIEWER no puede actualizar", (await discrepancia(doc.id)) === true);

    // 3. Otra organización no puede actualizar.
    const adminB = await b.cliente("ADMIN");
    await adminB.from("documentos_corporativos").update({ discrepancia_autorizada: false }).eq("id", doc.id);
    check("3. el ADMIN de otra organización no puede actualizar", (await discrepancia(doc.id)) === true);

    // 4. with check: no se puede mover la fila a otra organización.
    const { error: moverErr } = await analyst
      .from("documentos_corporativos")
      .update({ organization_id: b.orgId })
      .eq("id", doc.id);
    const { data: sigue } = await admin.from("documentos_corporativos").select("organization_id").eq("id", doc.id).single();
    check(
      "4. no se puede reasignar el documento a otra organización",
      sigue?.organization_id === a.orgId,
      `err=${moverErr?.message ?? "ninguno"} org=${sigue?.organization_id}`,
    );
  } finally {
    await limpiar();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
