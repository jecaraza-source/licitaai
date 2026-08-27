// P2 · H5 — integration: borrado de organización orquestado con ventana de
// gracia (migración 20260904000000 + handler borrar-organizacion.ts).
//
//   npx supabase start   (stop/start si el edge no recogió los handlers)
//   node tests/integration/p2-h5-borrado.test.mjs
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";
const FUNCTIONS_URL = `${URL}/functions/v1`;

if (URL.includes("supabase.co")) {
  console.error("Refusing to run against a hosted/remote project — local only.");
  process.exit(1);
}

const admin = createClient(URL, SERVICE_KEY);
let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  if (ok) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}${detail ? " — " + detail : ""}`); }
};
const rnd = () => Math.random().toString(36).slice(2, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const invokeWorker = () => fetch(`${FUNCTIONS_URL}/job-worker`, {
  method: "POST", headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
});
async function correrWorkerHasta(jobId, estados, maxTicks = 20) {
  const objetivo = Array.isArray(estados) ? estados : [estados];
  for (let i = 0; i < maxTicks; i++) {
    await invokeWorker().then((r) => r.json()).catch(() => ({}));
    await sleep(350);
    const { data } = await admin.from("jobs").select("*").eq("id", jobId).maybeSingle();
    if (!data) return null;
    if (objetivo.includes(data.estado)) return data;
    if (data.next_attempt_at) {
      await admin.from("jobs").update({ next_attempt_at: new Date(Date.now() - 1000).toISOString() }).eq("id", jobId);
    }
  }
  return (await admin.from("jobs").select("*").eq("id", jobId).maybeSingle()).data;
}

async function main() {
  await admin.from("jobs").delete().in("estado", ["PENDING", "AUTHORIZED", "RETRYING", "RUNNING"]);

  const nombreOrg = `Org ${rnd()}`;
  const { data: org } = await admin.from("organizations").insert({ nombre: nombreOrg }).select("id").single();
  const { data: ticket } = await admin.from("signup_tickets").insert({ organization_id: org.id }).select("id").single();
  const email = `u-${rnd()}@example.org`;
  const { data: u } = await admin.auth.admin.createUser({
    email, password: "TestPassword123!", email_confirm: true,
    user_metadata: { nombre: "T", signup_ticket: ticket.id },
  });
  const userId = u.user.id;
  const anon = createClient(URL, ANON_KEY);
  const { data: sess } = await anon.auth.signInWithPassword({ email, password: "TestPassword123!" });
  const asUser = createClient(URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${sess.session.access_token}` } },
  });

  // contenido: 1 licitación + doc + objeto en Storage
  const { data: lic } = await admin.from("licitaciones").insert({
    organization_id: org.id, numero_expediente: `EXP-${rnd()}`, titulo: "Lic",
    institucion: "Inst", tipo: "ADQUISICION", estado_id: "FEDERAL", sistema: "COMPRANET",
  }).select("id").single();
  await admin.from("documentos").insert({
    licitacion_id: lic.id, nombre: "d.pdf", tipo_documento: "BASES",
    storage_path: `${org.id}/${lic.id}/d.pdf`,
  });
  await admin.storage.from("documentos-originales").upload(`${org.id}/${lic.id}/d.pdf`, new Blob(["hola"]), { upsert: true });

  // --- 1. confirmación incorrecta -> error ---
  {
    const { error } = await asUser.rpc("solicitar_borrado_organizacion", { p_confirmacion: "otro nombre" });
    check("1. confirmación que no es el nombre de la org -> rechazada", !!error && (error.hint ?? "").includes("confirmacion"));
  }

  // --- 2. no-ADMIN -> 42501 ---
  {
    await admin.from("users").update({ rol: "VIEWER" }).eq("id", userId);
    const { error } = await asUser.rpc("solicitar_borrado_organizacion", { p_confirmacion: nombreOrg });
    check("2. un no-ADMIN no puede solicitar el borrado", error?.code === "42501");
    await admin.from("users").update({ rol: "ADMIN" }).eq("id", userId);
  }

  // --- 3. solicitar borrado ---
  let reqId, exportJobId;
  {
    const { data: req, error } = await asUser.rpc("solicitar_borrado_organizacion", { p_confirmacion: nombreOrg });
    check("3. solicitar_borrado_organizacion crea la solicitud PROGRAMADA", !error && req?.estado === "PROGRAMADA", error?.message);
    check("4. ventana de gracia ~7 días", new Date(req.programada_para).getTime() - Date.now() > 6 * 86400_000);
    check("5. encoló un job de export", !!req.export_job_id);
    reqId = req.id;
    exportJobId = req.export_job_id;

    const { data: audit } = await admin.from("audit_log").select("accion")
      .eq("organization_id", org.id).eq("accion", "organizacion_borrado_solicitado");
    check("6. quedó en la bitácora inmutable", (audit ?? []).length === 1);
  }

  // --- 4. solicitud duplicada -> conflicto ---
  {
    const { error } = await asUser.rpc("solicitar_borrado_organizacion", { p_confirmacion: nombreOrg });
    check("7. segunda solicitud mientras hay una activa -> rechazada", (error?.hint ?? "").includes("ya_existe"));
  }

  // --- 5. cancelar dentro de la gracia ---
  {
    const { data, error } = await asUser.rpc("cancelar_borrado_organizacion");
    check("8. cancelar_borrado_organizacion -> CANCELADA", !error && data?.estado === "CANCELADA", error?.message);
    // re-solicitar para continuar la prueba
    const { data: req2 } = await asUser.rpc("solicitar_borrado_organizacion", { p_confirmacion: nombreOrg });
    reqId = req2.id;
    exportJobId = req2.export_job_id;
  }

  // --- 6. correr el export ---
  {
    const final = await correrWorkerHasta(exportJobId, ["COMPLETED", "FAILED"]);
    check("9. el job de export COMPLETA", final?.estado === "COMPLETED", `estado=${final?.estado}`);
  }

  // --- 7. promover: no vencida todavía ---
  {
    const { data } = await admin.rpc("promover_borrados_vencidos");
    check("10. promover_borrados_vencidos no toca la solicitud aún no vencida", (data.promovidos ?? []).length === 0);
  }

  // --- 8. forzar vencimiento y promover ---
  let borradoJobId;
  {
    await admin.from("deletion_requests").update({ programada_para: new Date(Date.now() - 1000).toISOString() }).eq("id", reqId);
    const { data } = await admin.rpc("promover_borrados_vencidos");
    check("11. promover encola el job borrar-organizacion", (data.promovidos ?? []).length === 1);
    const { data: req } = await admin.from("deletion_requests").select("*").eq("id", reqId).single();
    check("12. la solicitud pasó a EN_PROCESO", req.estado === "EN_PROCESO" && !!req.borrado_job_id);
    borradoJobId = req.borrado_job_id;
  }

  // --- 9. correr el job de borrado ---
  {
    const final = await correrWorkerHasta(borradoJobId, ["COMPLETED", "FAILED"]);
    check("13. el job borrar-organizacion COMPLETA", final?.estado === "COMPLETED",
      `estado=${final?.estado} err=${final?.error_interno_ref}`);
    const rr = final?.result_ref ?? {};
    check("14. result_ref con hash del manifiesto + conteos", /^[0-9a-f]{64}$/.test(rr.manifiesto_sha256 ?? "") && rr.usuarios_borrados === 1);

    // Storage de la org vacío
    const { data: objs } = await admin.storage.from("documentos-originales").list(`${org.id}/${lic.id}`);
    check("15. Storage de la organización vacío", (objs ?? []).length === 0);

    // sesiones revocadas
    const { data: { user: aunValido } } = await asUser.auth.getUser().then((r) => r).catch(() => ({ data: { user: null } }));
    check("16. la sesión del usuario quedó revocada", !aunValido);

    // cuentas de auth borradas
    const { data: authUser } = await admin.auth.admin.getUserById(userId).catch(() => ({ data: { user: null } }));
    check("17. la cuenta de auth fue borrada", !authUser?.user);

    // la organización TODAVÍA existe (el DELETE lo hace el cron)
    const { data: orgAun } = await admin.from("organizations").select("id").eq("id", org.id).maybeSingle();
    check("18. la organización aún existe (falta el paso del cron)", !!orgAun);

    const { data: req } = await admin.from("deletion_requests").select("datos_purgados_at, manifiesto_hash").eq("id", reqId).single();
    check("19. datos_purgados_at + manifiesto_hash fijados", !!req.datos_purgados_at && req.manifiesto_hash === rr.manifiesto_sha256);
  }

  // --- 10. finalizar: DELETE de la organización ---
  {
    const { data } = await admin.rpc("finalizar_borrados_completados");
    check("20. finalizar_borrados_completados borra 1 organización", (data.finalizados ?? []).length === 1);

    const { data: orgAun } = await admin.from("organizations").select("id").eq("id", org.id).maybeSingle();
    check("21. la organización ya NO existe", !orgAun);
    const { data: licAun } = await admin.from("licitaciones").select("id").eq("id", lic.id).maybeSingle();
    check("22. el cascade limpió las licitaciones", !licAun);

    // evidencia inmutable sobrevive
    const { data: arch } = await admin.from("retencion_archive").select("*").eq("recurso", "deletion_manifest").eq("fila_id", org.id);
    check("23. retencion_archive conserva el manifiesto de borrado", (arch ?? []).length === 1 && !!arch[0].fila.manifiesto_sha256);
    const { data: audit } = await admin.from("audit_log").select("accion, detalle_json").eq("recurso_id", org.id).eq("accion", "organizacion_borrada");
    check("24. audit_log conserva 'organizacion_borrada' con el hash", (audit ?? []).length === 1 && !!audit[0].detalle_json.manifiesto_sha256);
    // la fila de audit CONSERVA el organization_id histórico (se quitó la FK)
    const { data: auditHist } = await admin.from("audit_log").select("organization_id").eq("recurso_id", org.id).eq("accion", "organizacion_borrada").single();
    check("25. audit_log conserva el organization_id histórico tras el borrado", auditHist.organization_id === org.id);
    const { data: cadena } = await admin.rpc("verificar_cadena_auditoria", { p_org: org.id });
    const v = Array.isArray(cadena) ? cadena[0] : cadena;
    check("26. la cadena de auditoría de la org borrada sigue íntegra", v.rota_en === null && Number(v.total) >= 2);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
