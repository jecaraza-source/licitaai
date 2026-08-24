// LicitaAI — extrae la fecha de emisión de un documento corporativo y,
// cuando el tipo de documento tiene una regla de vigencia conocida,
// calcula hasta cuándo sigue siendo válido.

import { createClient } from "jsr:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@^0.68";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { withRetry } from "../_shared/retry.ts";

const SYSTEM_PROMPT = `Eres un asistente que extrae datos de documentos oficiales mexicanos
(actas, poderes, constancias fiscales, opiniones de cumplimiento, identificaciones, etc.).
Busca la fecha de emisión o expedición del documento. Si el documento indica explícitamente
una fecha de vigencia, vencimiento o "válido hasta", repórtala también. También busca el RFC
y la razón social (o nombre de la persona) a quien pertenece el documento, para poder
verificar que corresponde a la empresa correcta. Si no puedes determinar un dato con certeza,
repórtalo como null en vez de adivinar. Usa siempre la herramienta proporcionada.`;

const TOOL_SCHEMA = {
  type: "object" as const,
  properties: {
    fecha_emision: {
      type: ["string", "null"],
      description: "Fecha de emisión/expedición del documento en formato YYYY-MM-DD, o null",
    },
    fecha_vigencia_indicada: {
      type: ["string", "null"],
      description:
        "Fecha de vigencia o vencimiento indicada explícitamente en el documento (YYYY-MM-DD), o null si el documento no la indica",
    },
    rfc_detectado: {
      type: ["string", "null"],
      description: "RFC de la empresa o persona a quien pertenece el documento, o null si no aparece",
    },
    razon_social_detectada: {
      type: ["string", "null"],
      description:
        "Razón social o nombre completo de la empresa/persona a quien pertenece el documento, o null si no aparece",
    },
  },
  required: ["fecha_emision", "fecha_vigencia_indicada", "rfc_detectado", "razon_social_detectada"],
  additionalProperties: false,
};

// Reglas de vigencia por tipo de documento (deben reflejar las mismas
// mostradas en documentos-corporativos-card.tsx). Solo se listan los tipos
// con un plazo fijo y conocido; el resto no tiene vigencia calculable.
const REGLAS_VIGENCIA: Record<string, { dias: number; habiles?: boolean }> = {
  "Constancia de Situación Fiscal": { dias: 30 },
  "Comprobante de domicilio": { dias: 90 },
  "Datos bancarios": { dias: 90 },
  "Opinión de cumplimiento fiscal (32-D)": { dias: 30 },
  "Cumplimiento IMSS": { dias: 15, habiles: true },
  "Cumplimiento INFONAVIT": { dias: 30 },
};

function uint8ArrayToBase64(bytes: Uint8Array): string {
  const CHUNK = 8192;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function sumarDiasNaturales(fecha: Date, dias: number): Date {
  const resultado = new Date(fecha);
  resultado.setUTCDate(resultado.getUTCDate() + dias);
  return resultado;
}

function sumarDiasHabiles(fecha: Date, dias: number): Date {
  const resultado = new Date(fecha);
  let restantes = dias;
  while (restantes > 0) {
    resultado.setUTCDate(resultado.getUTCDate() + 1);
    const diaSemana = resultado.getUTCDay();
    if (diaSemana !== 0 && diaSemana !== 6) restantes--;
  }
  return resultado;
}

function normalizarTexto(texto: string): string {
  // NFD + strip-non-alphanumeric quita acentos y cualquier puntuación/espacio
  // de un solo golpe (las marcas diacríticas que separa NFD no son A-Z0-9).
  return texto
    .toUpperCase()
    .normalize("NFD")
    .replace(/[^A-Z0-9]/g, "");
}

/**
 * true = coincide, false = no coincide, null = el documento no traía RFC
 * ni razón social para comparar (p. ej. un comprobante de domicilio).
 */
function coincideEmpresa(
  empresa: { rfc: string | null; razon_social: string | null } | null,
  rfcDetectado: string | null,
  razonSocialDetectada: string | null,
): boolean | null {
  if (!empresa) return null;

  if (rfcDetectado && empresa.rfc) {
    return normalizarTexto(rfcDetectado) === normalizarTexto(empresa.rfc);
  }

  if (razonSocialDetectada && empresa.razon_social) {
    const detectada = normalizarTexto(razonSocialDetectada);
    const propia = normalizarTexto(empresa.razon_social);
    return detectada === propia || detectada.includes(propia) || propia.includes(detectada);
  }

  return null;
}

function calcularVigenciaHasta(tipo: string, fechaEmision: string | null): string | null {
  const regla = REGLAS_VIGENCIA[tipo];
  if (!regla || !fechaEmision) return null;

  const emision = new Date(`${fechaEmision}T00:00:00Z`);
  if (Number.isNaN(emision.getTime())) return null;

  const vigenciaHasta = regla.habiles
    ? sumarDiasHabiles(emision, regla.dias)
    : sumarDiasNaturales(emision, regla.dias);

  return vigenciaHasta.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const { documento_id, fecha_emision_manual } = await req.json();
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

    const { data: documento, error: docError } = await supabase
      .from("documentos_corporativos")
      .select("id, tipo, nombre, storage_path, empresa_perfil_id")
      .eq("id", documento_id)
      .single();
    if (docError || !documento) throw new Error("Documento no encontrado");

    const { data: empresa } = await supabase
      .from("empresa_perfil")
      .select("rfc, razon_social")
      .eq("id", documento.empresa_perfil_id)
      .maybeSingle();

    // Si el usuario capturó la fecha a mano (porque no se pudo detectar
    // automáticamente, o para corregirla), no hace falta volver a llamar
    // a Claude: solo recalculamos la vigencia con la misma regla.
    if (typeof fecha_emision_manual === "string" && fecha_emision_manual) {
      const vigenciaHasta = calcularVigenciaHasta(documento.tipo, fecha_emision_manual);
      await supabase
        .from("documentos_corporativos")
        .update({ fecha_emision: fecha_emision_manual, vigencia_hasta: vigenciaHasta })
        .eq("id", documento_id);

      return new Response(
        JSON.stringify({ ok: true, data: { fecha_emision: fecha_emision_manual, vigencia_hasta: vigenciaHasta } }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

    const { data: archivo, error: downloadError } = await supabase.storage
      .from("documentos-corporativos")
      .download(documento.storage_path);
    if (downloadError || !archivo) throw new Error("No se pudo descargar el documento");

    const base64 = uint8ArrayToBase64(new Uint8Array(await archivo.arrayBuffer()));
    const mediaType = documento.nombre.toLowerCase().endsWith(".pdf")
      ? "application/pdf"
      : "image/jpeg";

    const response = await withRetry(() =>
      anthropic.messages.create({
        model: "claude-sonnet-5",
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        tools: [
          {
            name: "reportar_fechas",
            description: "Reporta las fechas detectadas en el documento",
            input_schema: TOOL_SCHEMA,
          },
        ],
        tool_choice: { type: "tool", name: "reportar_fechas" },
        messages: [
          {
            role: "user",
            content: [
              { type: "document", source: { type: "base64", media_type: mediaType, data: base64 } },
              { type: "text", text: `Tipo de documento: ${documento.tipo}` },
            ],
          },
        ],
      }),
    );

    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    const datos = toolUse?.input as
      | {
          fecha_emision: string | null;
          fecha_vigencia_indicada: string | null;
          rfc_detectado: string | null;
          razon_social_detectada: string | null;
        }
      | undefined;
    if (!datos) throw new Error("No se pudieron extraer datos del documento");

    const vigenciaHasta =
      datos.fecha_vigencia_indicada ?? calcularVigenciaHasta(documento.tipo, datos.fecha_emision);
    const coincide = coincideEmpresa(empresa, datos.rfc_detectado, datos.razon_social_detectada);

    await supabase
      .from("documentos_corporativos")
      .update({
        fecha_emision: datos.fecha_emision,
        vigencia_hasta: vigenciaHasta,
        coincide_empresa: coincide,
      })
      .eq("id", documento_id);

    return new Response(
      JSON.stringify({
        ok: true,
        data: { fecha_emision: datos.fecha_emision, vigencia_hasta: vigenciaHasta, coincide_empresa: coincide },
      }),
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
