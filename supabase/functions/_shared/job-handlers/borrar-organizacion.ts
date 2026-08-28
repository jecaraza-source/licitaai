// P2 · H5 — handler del job `borrar-organizacion` (ADR 0010).
//
// Orquestación multi-step. ON DELETE CASCADE es SOLO el último paso.
//
//   step "preparar"  -> verifica que el export esté COMPLETED; arma el
//                       manifiesto (conteos + inventario de Storage)
//   step "revocar"   -> revoca sesiones y refresh tokens de la organización
//   step "storage"   -> borra todos los objetos bajo {org}/ en los buckets
//   step "purgar"    -> cancela jobs en vuelo; sella la evidencia inmutable
//                       (audit_log + retencion_archive con el hash del
//                       manifiesto); borra los usuarios de auth; marca
//                       deletion_requests.datos_purgados_at
//
// El `DELETE FROM organizations` (cascade) NO lo hace este job: borraría su
// propia fila (jobs.organization_id ON DELETE CASCADE) a mitad de camino.
// Lo hace `finalizar_borrados_completados()` desde el cron, una vez este
// job está COMPLETED.
//
// Reanudable: cada step es idempotente (borrar lo ya borrado no falla).

import { ErrorNoReintentable, type JobContext, type StepResult } from "../job-runner.ts";
import { borrarPrefijo } from "../storage-prefijo.ts";
import { BUCKETS_ORG } from "./exportar-organizacion.ts";

interface Parcial {
  deletion_request_id: string;
  manifiesto?: Record<string, unknown>;
  sesiones_revocadas?: number;
  storage_borrado?: number;
}

function deletionRequestId(ctx: JobContext): string {
  const id = (ctx.job.input_json as { deletion_request_id?: string })?.deletion_request_id;
  if (!id) throw new ErrorNoReintentable("El job no indica qué solicitud de borrado ejecutar");
  return id;
}

async function cargarSolicitud(ctx: JobContext, id: string) {
  const { data, error } = await ctx.service
    .from("deletion_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`No se pudo leer deletion_requests: ${error.message}`);
  if (!data) throw new ErrorNoReintentable("La solicitud de borrado ya no existe");
  return data as Record<string, unknown>;
}

async function stepPreparar(ctx: JobContext): Promise<StepResult> {
  const org = ctx.job.organization_id;
  const drId = deletionRequestId(ctx);
  const sol = await cargarSolicitud(ctx, drId);

  if (sol.estado === "COMPLETADA") {
    return { completo: { resultRef: { ya_completada: true, deletion_request_id: drId } } };
  }
  if (sol.estado !== "EN_PROCESO") {
    throw new ErrorNoReintentable(`La solicitud está en estado ${sol.estado}, no EN_PROCESO`);
  }

  // El export debe estar COMPLETED (garantía del ADR: exportar antes de borrar).
  const { data: exp } = await ctx.service
    .from("jobs")
    .select("estado, result_ref")
    .eq("id", sol.export_job_id as string)
    .maybeSingle();
  if (!exp || exp.estado !== "COMPLETED") {
    throw new ErrorNoReintentable("El export de la organización no está COMPLETED; se aborta el borrado");
  }

  await ctx.reportarProgreso(10, "midiendo el alcance del borrado");
  const { data: bundle } = await ctx.service.rpc("exportar_datos_organizacion", { p_org: org });
  const tablas: Record<string, number> = {};
  for (const [k, v] of Object.entries((bundle ?? {}) as Record<string, unknown>)) {
    if (Array.isArray(v)) tablas[k] = v.length;
  }

  let storageArchivos = 0;
  const storage: Record<string, number> = {};
  for (const bucket of BUCKETS_ORG) {
    const { data } = await ctx.service.storage.from(bucket).list(org, { limit: 1 });
    // conteo real se hace en el step storage; aquí solo marca presencia
    if ((data ?? []).length > 0) storage[bucket] = -1;
  }

  const manifiesto = {
    formato: "licitaai.deletion.manifiesto.v1",
    organization_id: org,
    deletion_request_id: drId,
    export_job_id: sol.export_job_id,
    export_result_ref: exp.result_ref,
    tablas,
    storage_buckets_con_datos: Object.keys(storage),
    storage_archivos: storageArchivos,
    preparado_at: new Date().toISOString(),
  };

  await ctx.service.from("deletion_requests")
    .update({ detalle_json: { manifiesto } })
    .eq("id", drId);

  const parcial: Parcial = { deletion_request_id: drId, manifiesto };
  return { siguienteStep: { step: "revocar", resultParcial: parcial, progreso: 20 } };
}

async function stepRevocar(ctx: JobContext): Promise<StepResult> {
  const parcial = (ctx.job.result_ref ?? {}) as Parcial;
  await ctx.reportarProgreso(30, "revocando sesiones");

  const { data, error } = await ctx.service.rpc("revocar_sesiones_organizacion", {
    p_org: ctx.job.organization_id,
  });
  if (error) throw new Error(`revocar_sesiones_organizacion: ${error.message}`);

  parcial.sesiones_revocadas = typeof data === "number" ? data : 0;
  return { siguienteStep: { step: "storage", resultParcial: parcial, progreso: 40 } };
}

async function stepStorage(ctx: JobContext): Promise<StepResult> {
  const org = ctx.job.organization_id;
  const parcial = (ctx.job.result_ref ?? {}) as Parcial;

  let total = 0;
  for (const bucket of BUCKETS_ORG) {
    await ctx.reportarProgreso(45, `borrando archivos (${bucket})`);
    total += await borrarPrefijo(ctx.service, bucket, org);
  }
  parcial.storage_borrado = total;
  if (parcial.manifiesto) {
    (parcial.manifiesto as Record<string, unknown>).storage_archivos = total;
  }

  return { siguienteStep: { step: "purgar", resultParcial: parcial, progreso: 70 } };
}

async function stepPurgar(ctx: JobContext): Promise<StepResult> {
  const org = ctx.job.organization_id;
  const parcial = (ctx.job.result_ref ?? {}) as Parcial;
  const drId = parcial.deletion_request_id ?? deletionRequestId(ctx);

  // 1. cancelar jobs en vuelo de la organización (menos este)
  await ctx.reportarProgreso(75, "cancelando trabajos en vuelo");
  await ctx.service
    .from("jobs")
    .update({ estado: "CANCELLED", cancel_solicitada: true, finished_at: new Date().toISOString() })
    .eq("organization_id", org)
    .in("estado", ["PENDING", "AUTHORIZED", "RETRYING"])
    .neq("id", ctx.job.id);

  // 2. sello inmutable ANTES de borrar (la organización todavía existe)
  await ctx.reportarProgreso(82, "sellando la evidencia de borrado");
  const manifiestoFinal = {
    ...(parcial.manifiesto ?? { organization_id: org, deletion_request_id: drId }),
    sesiones_revocadas: parcial.sesiones_revocadas ?? 0,
    storage_archivos: parcial.storage_borrado ?? 0,
  };
  const { data: hash, error: eSello } = await ctx.service.rpc("sellar_borrado_organizacion", {
    p_org: org,
    p_manifiesto: manifiestoFinal,
  });
  if (eSello) throw new Error(`sellar_borrado_organizacion: ${eSello.message}`);

  // 3. borrar las cuentas de auth (cascada a identities/sessions y a
  //    public.users). El dominio (licitaciones, docs, ai_*) lo limpiará el
  //    cascade de organizations en finalizar_borrados_completados.
  await ctx.reportarProgreso(88, "borrando cuentas");
  const { data: nCuentas, error: eCuentas } = await ctx.service.rpc("purgar_cuentas_organizacion", {
    p_org: org,
  });
  if (eCuentas) throw new Error(`purgar_cuentas_organizacion: ${eCuentas.message}`);

  // 4. marcar datos purgados. El DELETE de la organización lo hace el cron.
  await ctx.service
    .from("deletion_requests")
    .update({ datos_purgados_at: new Date().toISOString(), manifiesto_hash: hash })
    .eq("id", drId);

  await ctx.reportarProgreso(100);
  return {
    completo: {
      resultRef: {
        deletion_request_id: drId,
        manifiesto_sha256: hash,
        sesiones_revocadas: parcial.sesiones_revocadas ?? 0,
        storage_borrado: parcial.storage_borrado ?? 0,
        usuarios_borrados: typeof nCuentas === "number" ? nCuentas : 0,
      },
    },
  };
}

export async function borrarOrganizacionHandler(ctx: JobContext): Promise<StepResult> {
  switch (ctx.job.step_actual) {
    case null:
    case undefined:
    case "preparar":
      return stepPreparar(ctx);
    case "revocar":
      return stepRevocar(ctx);
    case "storage":
      return stepStorage(ctx);
    case "purgar":
      return stepPurgar(ctx);
    default:
      throw new ErrorNoReintentable(`Step desconocido: ${ctx.job.step_actual}`);
  }
}
