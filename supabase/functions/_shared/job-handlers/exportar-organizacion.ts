// P2 · H4 — handler del job `exportar-organizacion` (ADR 0010).
//
// Un solo step:
//   1. exportar_datos_organizacion(org)  -> bundle jsonb con todo el dominio
//   2. lista los objetos de Storage de la organización (todos los buckets)
//   3. sube export.json + manifiesto.json a exportaciones/{org}/{job_id}/
//   4. genera una URL firmada de 72 h del manifiesto
//   5. result_ref = { archivo, manifiesto, url, expira_at, sha256, bytes, tablas }
//
// No llama a ningún proveedor de IA: sin costo, sin circuit breaker.
// El manifiesto lleva el sha256 del export para verificación de integridad
// (y es lo que el job `borrar-organizacion` encadena en audit_log, H5).

import { ErrorNoReintentable, type JobContext, type StepResult } from "../job-runner.ts";
import { listarPrefijo } from "../storage-prefijo.ts";

export const BUCKETS_ORG = [
  "documentos-originales",
  "propuestas-generadas",
  "documentos-requeridos",
  "documentos-corporativos",
  "logos-empresa",
];
const TTL_URL_SEG = 72 * 3600;

async function sha256Hex(texto: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function exportarOrganizacionHandler(ctx: JobContext): Promise<StepResult> {
  const org = ctx.job.organization_id;
  const jobId = ctx.job.id;
  if (!org) throw new ErrorNoReintentable("El job no tiene organización");

  await ctx.reportarProgreso(10, "reuniendo datos");
  const { data: bundle, error } = await ctx.service.rpc("exportar_datos_organizacion", { p_org: org });
  if (error) throw new Error(`exportar_datos_organizacion: ${error.message}`);
  if (!bundle) throw new ErrorNoReintentable("El export no produjo datos");

  await ctx.reportarProgreso(45, "inventariando archivos");
  const storage: Record<string, string[]> = {};
  let totalArchivos = 0;
  for (const bucket of BUCKETS_ORG) {
    const objetos = await listarPrefijo(ctx.service, bucket, org);
    if (objetos.length > 0) {
      storage[bucket] = objetos;
      totalArchivos += objetos.length;
    }
  }

  const exportJson = JSON.stringify(bundle);
  const sha = await sha256Hex(exportJson);

  const tablas: Record<string, number> = {};
  for (const [k, v] of Object.entries(bundle as Record<string, unknown>)) {
    if (Array.isArray(v)) tablas[k] = v.length;
  }

  const base = `${org}/${jobId}`;
  await ctx.reportarProgreso(70, "subiendo export");
  const up1 = await ctx.service.storage.from("exportaciones").upload(`${base}/export.json`, exportJson, {
    contentType: "application/json",
    upsert: true,
  });
  if (up1.error) throw new Error(`upload export.json: ${up1.error.message}`);

  const manifiesto = {
    formato: "licitaai.export.manifiesto.v1",
    generado_at: new Date().toISOString(),
    organization_id: org,
    job_id: jobId,
    export_sha256: sha,
    export_bytes: exportJson.length,
    tablas,
    storage_archivos: totalArchivos,
    storage,
    nota:
      "export.json contiene los datos estructurados. Los archivos de Storage listados en `storage` " +
      "no van en este bundle; se copian aparte en el borrado orquestado o se descargan con URLs firmadas.",
  };
  const manifiestoJson = JSON.stringify(manifiesto, null, 2);
  const up2 = await ctx.service.storage.from("exportaciones").upload(`${base}/manifiesto.json`, manifiestoJson, {
    contentType: "application/json",
    upsert: true,
  });
  if (up2.error) throw new Error(`upload manifiesto.json: ${up2.error.message}`);

  await ctx.reportarProgreso(90, "firmando URL");
  const { data: firma, error: eFirma } = await ctx.service.storage
    .from("exportaciones")
    .createSignedUrl(`${base}/manifiesto.json`, TTL_URL_SEG);
  if (eFirma) throw new Error(`createSignedUrl: ${eFirma.message}`);

  await ctx.reportarProgreso(100);
  return {
    completo: {
      resultRef: {
        bucket: "exportaciones",
        archivo: `${base}/export.json`,
        manifiesto: `${base}/manifiesto.json`,
        url: firma?.signedUrl ?? null,
        expira_at: new Date(Date.now() + TTL_URL_SEG * 1000).toISOString(),
        export_sha256: sha,
        export_bytes: exportJson.length,
        storage_archivos: totalArchivos,
        tablas,
      },
    },
  };
}
