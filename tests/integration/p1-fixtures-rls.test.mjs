// P1.3 — valida las fixtures compartidas y, de paso, el aislamiento
// multi-tenant a nivel de RLS: un usuario de la organización A nunca ve ni
// toca filas de la organización B, y un VIEWER no puede escribir.
//
// Usage:
//   npx supabase start
//   node tests/integration/p1-fixtures-rls.test.mjs
import {
  crearOrganizacionesAyB,
  crearLicitacion,
  crearInvitacion,
} from "../helpers/fixtures.mjs";

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

async function main() {
  const { a, b, limpiar } = await crearOrganizacionesAyB();

  try {
    // ── fixtures ──────────────────────────────────────────────────────
    check("1. org A tiene los 4 roles", Object.keys(a.usuarios).sort().join(",") === "ADMIN,ANALYST,MANAGER,VIEWER");
    check("2. cada rol quedó fijado en la base", a.usuarios.VIEWER.rol === "VIEWER" && a.usuarios.MANAGER.rol === "MANAGER");

    const invValida = await crearInvitacion(a.orgId);
    const invVencida = await crearInvitacion(a.orgId, { vencida: true });
    check("3. invitación válida no está expirada", new Date(invValida.expires_at) > new Date());
    check("4. invitación vencida está expirada", new Date(invVencida.expires_at) < new Date());

    // ── aislamiento multi-tenant (RLS) ──────────────────────────────
    const licA = await crearLicitacion(a.orgId, { titulo: "Secreta de A" });
    await crearLicitacion(b.orgId, { titulo: "Secreta de B" });

    const clienteA = await a.cliente("ADMIN");
    const { data: visibles } = await clienteA.from("licitaciones").select("id, titulo");
    check(
      "5. el ADMIN de A solo ve licitaciones de A",
      (visibles ?? []).length === 1 && visibles[0].titulo === "Secreta de A",
      `vio: ${JSON.stringify(visibles)}`,
    );

    const clienteBAdmin = await b.cliente("ADMIN");
    const { data: filaCruzada } = await clienteBAdmin
      .from("licitaciones")
      .select("id")
      .eq("id", licA.id)
      .maybeSingle();
    check("6. el ADMIN de B no puede leer una licitación de A por id", filaCruzada === null);

    const { error: updCruzado } = await clienteBAdmin
      .from("licitaciones")
      .update({ titulo: "hackeada" })
      .eq("id", licA.id);
    const { data: sigueIgual } = await a.cliente("ANALYST").then((c) =>
      c.from("licitaciones").select("titulo").eq("id", licA.id).single(),
    );
    check(
      "7. el ADMIN de B no puede modificar una licitación de A",
      sigueIgual?.titulo === "Secreta de A",
      `updErr=${updCruzado?.message ?? "ninguno"} titulo=${sigueIgual?.titulo}`,
    );

    // ── VIEWER no escribe ───────────────────────────────────────────
    const clienteViewer = await a.cliente("VIEWER");
    const { error: escrituraViewer } = await clienteViewer
      .from("licitaciones")
      .update({ titulo: "editada por viewer" })
      .eq("id", licA.id);
    const { data: trasViewer } = await clienteA
      .from("licitaciones")
      .select("titulo")
      .eq("id", licA.id)
      .single();
    check(
      "8. un VIEWER de A no puede escribir en una licitación de su propia org",
      trasViewer?.titulo === "Secreta de A",
      `err=${escrituraViewer?.message ?? "ninguno"}`,
    );
  } finally {
    await limpiar();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
