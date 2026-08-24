// LicitaAI — carga (o recarga) el texto oficial de una ley/reglamento del
// catálogo de Referencias legales: sube el PDF a Storage, registra el
// documento y dispara el procesamiento (chunking por artículo + embeddings).
//
// Uso:
//   node scripts/seed-referencias-legales.mjs <NOMBRE_CATALOGO> <ruta-al-pdf>
//
// Requiere en el entorno: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// El catálogo (public.referencias_legales) debe existir ya con ese `nombre`
// (ver supabase/migrations/20260826100000_referencias_legales.sql).

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { basename } from "node:path";

const [, , nombreCatalogo, rutaArchivo] = process.argv;

if (!nombreCatalogo || !rutaArchivo) {
  console.error("Uso: node scripts/seed-referencias-legales.mjs <NOMBRE_CATALOGO> <ruta-al-pdf>");
  process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en el entorno.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

const { data: referencia, error: refError } = await supabase
  .from("referencias_legales")
  .select("id, nombre")
  .eq("nombre", nombreCatalogo)
  .single();

if (refError || !referencia) {
  console.error(`No existe "${nombreCatalogo}" en referencias_legales:`, refError?.message);
  process.exit(1);
}

const nombreArchivo = basename(rutaArchivo);
const storagePath = `${referencia.id}/${Date.now()}-${nombreArchivo}`;
const archivo = readFileSync(rutaArchivo);

console.log(`Subiendo ${nombreArchivo} (${archivo.length} bytes) a referencias-legales/${storagePath}…`);
const { error: uploadError } = await supabase.storage
  .from("referencias-legales")
  .upload(storagePath, archivo, { contentType: "application/pdf" });
if (uploadError) {
  console.error("Error subiendo a Storage:", uploadError.message);
  process.exit(1);
}

const { data: documento, error: docError } = await supabase
  .from("referencia_legal_documentos")
  .insert({ referencia_legal_id: referencia.id, nombre: nombreArchivo, storage_path: storagePath })
  .select("id")
  .single();
if (docError || !documento) {
  console.error("Error registrando el documento:", docError?.message);
  process.exit(1);
}

console.log(`Documento registrado (${documento.id}). Procesando (chunking + embeddings)…`);
const { data, error: fnError } = await supabase.functions.invoke("procesar-referencia-legal", {
  body: { referencia_documento_id: documento.id },
});
if (fnError) {
  console.error("Error procesando:", fnError.message);
  process.exit(1);
}

console.log(`Listo: ${JSON.stringify(data)}`);
