// LicitaAI — Sprint 3: procesar-documento
//
// Descarga un documento de Storage, extrae su texto (con fallback a Claude
// para PDFs escaneados), lo divide en chunks y genera embeddings para
// búsqueda semántica (RAG).

import { createClient } from "jsr:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@^0.68";
import OpenAI from "npm:openai@^6";
import pdfParse from "npm:pdf-parse@^1.1.1";
import { RecursiveCharacterTextSplitter } from "npm:@langchain/textsplitters@^0.1";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { withRetry } from "../_shared/retry.ts";

const CHARS_POR_CHUNK = 4000; // ~1000 tokens en español/inglés
const OVERLAP_CHARS = 800; // ~200 tokens
const MIN_CHARS_POR_PAGINA = 100; // debajo de esto se considera "escaneado"

function uint8ArrayToBase64(bytes: Uint8Array): string {
  const CHUNK = 8192;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

async function extraerTextoConClaude(anthropic: Anthropic, pdfBase64: string): Promise<string> {
  const response = await withRetry(() =>
    anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 16000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
            },
            {
              type: "text",
              text: "Este documento es un PDF escaneado. Extrae TODO el texto visible, tal como aparece, preservando la estructura de secciones, tablas y listas en formato de texto plano. No agregues comentarios ni resúmenes, solo el texto extraído.",
            },
          ],
        },
      ],
    }),
  );

  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  return textBlock?.text ?? "";
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
    const { documento_id } = await req.json();
    if (!documento_id) {
      return new Response(JSON.stringify({ error: "documento_id requerido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });
    const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });

    const { data: documento, error: docError } = await supabase
      .from("documentos")
      .select("id, storage_path, nombre, licitacion_id")
      .eq("id", documento_id)
      .single();

    if (docError || !documento) {
      throw new Error(`Documento no encontrado: ${docError?.message}`);
    }

    const { data: archivo, error: downloadError } = await supabase.storage
      .from("documentos-originales")
      .download(documento.storage_path);

    if (downloadError || !archivo) {
      throw new Error(`No se pudo descargar el archivo: ${downloadError?.message}`);
    }

    const arrayBuffer = await archivo.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    let texto = "";
    let escaneado = false;
    let numPaginas = 1;

    if (documento.nombre.toLowerCase().endsWith(".pdf")) {
      try {
        const parsed = await pdfParse(buffer);
        texto = parsed.text ?? "";
        numPaginas = parsed.numpages || 1;
      } catch {
        // Si pdf-parse falla (PDF corrupto o completamente escaneado), continuamos
        // con el fallback de Claude Vision más abajo.
        numPaginas = 1;
      }

      const charsPorPagina = texto.length / numPaginas;
      if (charsPorPagina < MIN_CHARS_POR_PAGINA) {
        escaneado = true;
        const base64 = uint8ArrayToBase64(buffer);
        texto = await extraerTextoConClaude(anthropic, base64);
      }
    } else {
      // DOCX/XLSX u otros: se procesan en un sprint posterior con librerías dedicadas.
      texto = "";
    }

    if (!texto.trim()) {
      await supabase
        .from("documentos")
        .update({ procesado: true, procesado_at: new Date().toISOString() })
        .eq("id", documento_id);

      return new Response(
        JSON.stringify({ ok: true, chunks: 0, escaneado, aviso: "Sin texto extraíble" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: CHARS_POR_CHUNK,
      chunkOverlap: OVERLAP_CHARS,
    });
    const chunks = await splitter.splitText(texto);

    const BATCH = 20;
    let totalInsertados = 0;
    for (let i = 0; i < chunks.length; i += BATCH) {
      const lote = chunks.slice(i, i + BATCH);
      const embeddings = await generarEmbeddings(openai, lote);

      const filas = lote.map((contenido, idx) => ({
        documento_id,
        chunk_index: i + idx,
        contenido,
        embedding: embeddings[idx],
        metadata_json: { escaneado },
      }));

      const { error: insertError } = await supabase.from("document_chunks").insert(filas);
      if (insertError) throw new Error(`Error guardando chunks: ${insertError.message}`);
      totalInsertados += filas.length;
    }

    await supabase
      .from("documentos")
      .update({ procesado: true, procesado_at: new Date().toISOString() })
      .eq("id", documento_id);

    return new Response(
      JSON.stringify({ ok: true, chunks: totalInsertados, escaneado, paginas: numPaginas }),
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
