// LicitaAI — Referencias legales: procesar-referencia-legal
//
// Descarga el texto oficial de una ley/reglamento desde Storage, lo divide
// por artículo (para que las citas del asistente de IA sean precisas) y
// genera embeddings para búsqueda semántica (RAG). Mismo patrón que
// procesar-documento, pero writes a referencia_legal_chunks y conserva la
// etiqueta de artículo por fragmento.

import OpenAI from "npm:openai@^6";
import pdfParse from "npm:pdf-parse@^1.1.1";
import { RecursiveCharacterTextSplitter } from "npm:@langchain/textsplitters@^0.1";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { withRetry } from "../_shared/retry.ts";
import { authenticate, jsonError } from "../_shared/auth.ts";

const CHARS_POR_CHUNK = 3000;
const OVERLAP_CHARS = 400;

// "Artículo 47.", "ARTÍCULO 26 Bis.", "Artículo 1o." — encabezado al inicio de línea.
const ARTICULO_RE = /^\s*(art[ií]culo\s+\d+[a-z°º]*(?:\s+bis|\s+ter|\s+quater)?\.?)/gim;

interface Segmento {
  articulo: string | null;
  texto: string;
}

function segmentarPorArticulo(texto: string): Segmento[] {
  const matches = [...texto.matchAll(ARTICULO_RE)];
  if (matches.length < 3) {
    // Muy pocos encabezados detectados (preámbulos, transitorios sueltos, o un
    // formato distinto) — no hay suficiente señal para segmentar con confianza.
    return [{ articulo: null, texto }];
  }

  const segmentos: Segmento[] = [];
  if (matches[0].index! > 0) {
    segmentos.push({ articulo: null, texto: texto.slice(0, matches[0].index!) });
  }
  for (let i = 0; i < matches.length; i++) {
    const inicio = matches[i].index!;
    const fin = i + 1 < matches.length ? matches[i + 1].index! : texto.length;
    const etiqueta = matches[i][1].replace(/\s+/g, " ").trim();
    segmentos.push({ articulo: etiqueta, texto: texto.slice(inicio, fin) });
  }
  return segmentos;
}

async function generarEmbeddings(openai: OpenAI, textos: string[]): Promise<number[][]> {
  const response = await withRetry(() =>
    openai.embeddings.create({ model: "text-embedding-3-small", input: textos }),
  );
  return response.data.map((d) => d.embedding);
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    // referencia_legal_documentos es contenido global (catálogo de leyes),
    // no está scoped por organización — pero (re)procesarlo gasta cuota de
    // OpenAI y puede corromper el RAG compartido, así que se restringe a
    // ADMIN en vez de a cualquier usuario autenticado.
    const ctx = await authenticate(req, { ruta: "procesar-referencia-legal", requiereEscritura: true, maxPorMinuto: 5, permitirJob: true });
    if (ctx instanceof Response) return ctx;
    if (ctx.rol !== "ADMIN") {
      return jsonError(403, "Solo un administrador puede reprocesar el catálogo de referencias legales");
    }

    const { referencia_documento_id } = await req.json();
    if (!referencia_documento_id) {
      return jsonError(400, "referencia_documento_id requerido");
    }

    const supabase = ctx.service;
    const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });

    const { data: documento, error: docError } = await supabase
      .from("referencia_legal_documentos")
      .select("id, storage_path, nombre")
      .eq("id", referencia_documento_id)
      .single();

    if (docError || !documento) {
      throw new Error(`Documento no encontrado: ${docError?.message}`);
    }

    const { data: archivo, error: downloadError } = await supabase.storage
      .from("referencias-legales")
      .download(documento.storage_path);

    if (downloadError || !archivo) {
      throw new Error(`No se pudo descargar el archivo: ${downloadError?.message}`);
    }

    const arrayBuffer = await archivo.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    let texto = "";
    if (documento.nombre.toLowerCase().endsWith(".pdf")) {
      const parsed = await pdfParse(buffer);
      texto = parsed.text ?? "";
    } else {
      texto = new TextDecoder("utf-8").decode(buffer);
    }

    if (!texto.trim()) {
      throw new Error("El documento no contiene texto extraíble");
    }

    const segmentos = segmentarPorArticulo(texto);

    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: CHARS_POR_CHUNK,
      chunkOverlap: OVERLAP_CHARS,
    });

    const fragmentos: { articulo: string | null; contenido: string }[] = [];
    for (const seg of segmentos) {
      if (seg.texto.length <= CHARS_POR_CHUNK) {
        if (seg.texto.trim()) fragmentos.push({ articulo: seg.articulo, contenido: seg.texto.trim() });
        continue;
      }
      const subChunks = await splitter.splitText(seg.texto);
      for (const sub of subChunks) {
        if (sub.trim()) fragmentos.push({ articulo: seg.articulo, contenido: sub.trim() });
      }
    }

    // Borra chunks previos, por si es un reprocesamiento (ley reformada, texto corregido).
    await supabase
      .from("referencia_legal_chunks")
      .delete()
      .eq("referencia_documento_id", referencia_documento_id);

    const BATCH = 20;
    let totalInsertados = 0;
    for (let i = 0; i < fragmentos.length; i += BATCH) {
      const lote = fragmentos.slice(i, i + BATCH);
      const embeddings = await generarEmbeddings(
        openai,
        lote.map((f) => f.contenido),
      );

      const filas = lote.map((f, idx) => ({
        referencia_documento_id,
        chunk_index: i + idx,
        contenido: f.contenido,
        articulo: f.articulo,
        embedding: embeddings[idx],
      }));

      const { error: insertError } = await supabase.from("referencia_legal_chunks").insert(filas);
      if (insertError) throw new Error(`Error guardando chunks: ${insertError.message}`);
      totalInsertados += filas.length;
    }

    await supabase
      .from("referencia_legal_documentos")
      .update({ procesado: true, procesado_at: new Date().toISOString() })
      .eq("id", referencia_documento_id);

    return new Response(
      JSON.stringify({ ok: true, chunks: totalInsertados, data: { chunks: totalInsertados } }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error(error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Error desconocido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
