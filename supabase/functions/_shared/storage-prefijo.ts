// P2 · H4/H5 — utilidades de Storage por prefijo de organización.
//
// Convención de paths: `{organization_id}/...` (ver
// supabase/migrations/20260821150200_storage_buckets.sql).

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

/** Lista recursivamente todas las rutas de objeto bajo `prefijo` en `bucket`. */
export async function listarPrefijo(
  service: SupabaseClient,
  bucket: string,
  prefijo: string,
): Promise<string[]> {
  const salida: string[] = [];
  const pendientes = [prefijo];
  while (pendientes.length > 0) {
    const dir = pendientes.pop()!;
    const { data, error } = await service.storage.from(bucket).list(dir, { limit: 1000 });
    if (error) {
      console.warn(`[storage-prefijo] list ${bucket}/${dir}: ${error.message}`);
      continue;
    }
    for (const entry of data ?? []) {
      const ruta = dir ? `${dir}/${entry.name}` : entry.name;
      // Supabase marca las "carpetas" con id === null.
      if (entry.id === null) pendientes.push(ruta);
      else salida.push(ruta);
    }
  }
  return salida;
}

/** Borra todos los objetos bajo `prefijo` en `bucket`. Devuelve cuántos. */
export async function borrarPrefijo(
  service: SupabaseClient,
  bucket: string,
  prefijo: string,
): Promise<number> {
  const rutas = await listarPrefijo(service, bucket, prefijo);
  let borrados = 0;
  for (let i = 0; i < rutas.length; i += 100) {
    const lote = rutas.slice(i, i + 100);
    const { error } = await service.storage.from(bucket).remove(lote);
    if (error) throw new Error(`remove ${bucket} (${lote.length} objetos): ${error.message}`);
    borrados += lote.length;
  }
  return borrados;
}
