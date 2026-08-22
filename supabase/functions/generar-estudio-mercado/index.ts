// LicitaAI — Sprint 4: generar-estudio-mercado
//
// NOTA DE IMPLEMENTACIÓN: el spec original pedía consultar
// "https://api.datos.gob.mx/v1/contrataciones-abiertas", pero ese subdominio
// no existe (no responde ni al handshake TLS). En su lugar, usamos la
// herramienta nativa de búsqueda web de Claude para investigar precios de
// referencia reales, y una segunda llamada para estructurar los resultados.

import { createClient } from "jsr:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@^0.68";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { withRetry } from "../_shared/retry.ts";

const SYSTEM_PROMPT_INVESTIGACION = `Eres un analista de mercado especializado en compras gubernamentales mexicanas.
Investiga precios de referencia reales para la partida indicada usando búsqueda web.
Tienes un máximo de 4 búsquedas para este turno: úsalas con cuidado, combinando
términos en cada consulta en vez de hacer una búsqueda por cada fuente posible.
Prioriza fuentes en México o en pesos mexicanos.
Al finalizar tus búsquedas (las hayas agotado o no), SIEMPRE entrega un resumen
por escrito de lo que encontraste hasta ese momento, incluyendo precio, fecha
aproximada y la fuente de cada dato. Nunca respondas únicamente que no pudiste
completar la investigación: reporta los datos parciales que sí obtuviste, aunque
sean de una sola fuente, y señala explícitamente qué información falta.`;

const SYSTEM_PROMPT_ESTRUCTURA = `Eres un analista de mercado especializado en compras gubernamentales mexicanas.
Analiza los precios encontrados para la siguiente partida y determina un precio
de referencia justo y competitivo. Considera que el precio debe ser ganador
pero rentable. Identifica valores atípicos y descártalos.
Si la investigación tiene al menos un dato de precio aunque sea de una sola
fuente, repórtalo con nivel_confianza MEDIO o BAJO según corresponda, en vez de
usar null en todos los campos. Solo usa null en todos los precios si la
investigación no encontró ningún dato numérico utilizable.
Usa siempre la herramienta proporcionada para responder.`;

const ESTUDIO_TOOL_SCHEMA = {
  type: "object",
  properties: {
    precio_minimo: { type: ["number", "null"] },
    precio_maximo: { type: ["number", "null"] },
    precio_promedio: { type: ["number", "null"] },
    precio_recomendado: { type: ["number", "null"] },
    fuentes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          nombre: { type: "string" },
          precio: { type: ["number", "null"] },
          fecha: { type: ["string", "null"] },
          url: { type: ["string", "null"] },
        },
        required: ["nombre", "precio", "fecha", "url"],
        additionalProperties: false,
      },
    },
    observaciones: { type: ["string", "null"] },
    nivel_confianza: { type: "string", enum: ["ALTO", "MEDIO", "BAJO"] },
  },
  required: [
    "precio_minimo",
    "precio_maximo",
    "precio_promedio",
    "precio_recomendado",
    "fuentes",
    "observaciones",
    "nivel_confianza",
  ],
  additionalProperties: false,
};

type Partida = {
  id: string;
  numero: string;
  descripcion: string;
  unidad: string | null;
  cantidad: number | null;
};

async function investigarPartida(anthropic: Anthropic, partida: Partida): Promise<string> {
  // Streaming es obligatorio aquí: con web_search la llamada puede tardar más
  // de 150s sin emitir bytes, y el gateway de Edge Functions de Supabase
  // cierra la conexión por IDLE_TIMEOUT en llamadas no streaming.
  const response = await withRetry(() =>
    anthropic.messages
      .stream({
        model: "claude-sonnet-5",
        max_tokens: 4000,
        system: SYSTEM_PROMPT_INVESTIGACION,
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 4 }],
        messages: [
          {
            role: "user",
            content: `Partida ${partida.numero}: ${partida.descripcion}\nUnidad: ${partida.unidad ?? "N/D"}\nCantidad: ${partida.cantidad ?? "N/D"}\n\nInvestiga precios de referencia de mercado para esta partida.`,
          },
        ],
      })
      .finalMessage(),
  );

  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

// deno-lint-ignore no-explicit-any
async function estructurarEstudio(anthropic: Anthropic, investigacion: string): Promise<any> {
  const response = await withRetry(() =>
    anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 2000,
      system: SYSTEM_PROMPT_ESTRUCTURA,
      tools: [
        {
          name: "reportar_estudio_mercado",
          description: "Reporta el estudio de mercado estructurado",
          input_schema: ESTUDIO_TOOL_SCHEMA as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: "tool", name: "reportar_estudio_mercado" },
      messages: [{ role: "user", content: `Investigación de mercado:\n\n${investigacion}` }],
    }),
  );

  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );
  return toolUse?.input ?? null;
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const { licitacion_id, partida_id } = await req.json();
    if (!licitacion_id) {
      return new Response(JSON.stringify({ error: "licitacion_id requerido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

    let query = supabase
      .from("partidas")
      .select("id, numero, descripcion, unidad, cantidad")
      .eq("licitacion_id", licitacion_id);
    if (partida_id) query = query.eq("id", partida_id);

    const { data: partidas, error: partidasError } = await query;
    if (partidasError) throw new Error(partidasError.message);
    if (!partidas || partidas.length === 0) {
      return new Response(JSON.stringify({ error: "No hay partidas para analizar" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resultados = [];
    for (const partida of partidas as Partida[]) {
      const investigacion = await investigarPartida(anthropic, partida);
      const estructura = await estructurarEstudio(anthropic, investigacion);
      if (!estructura) continue;

      await supabase.from("estudio_mercado").delete().eq("partida_id", partida.id);
      const { data: fila, error: insertError } = await supabase
        .from("estudio_mercado")
        .insert({
          licitacion_id,
          partida_id: partida.id,
          precio_minimo: estructura.precio_minimo,
          precio_maximo: estructura.precio_maximo,
          precio_promedio: estructura.precio_promedio,
          precio_recomendado: estructura.precio_recomendado,
          fuentes_json: estructura.fuentes ?? [],
          observaciones: estructura.observaciones,
          nivel_confianza: estructura.nivel_confianza,
        })
        .select()
        .single();

      if (insertError) throw new Error(insertError.message);
      resultados.push(fila);
    }

    await supabase.from("actividad_log").insert({
      licitacion_id,
      accion: "estudio_mercado",
      metadata_json: { partidas_analizadas: resultados.length },
    });

    return new Response(JSON.stringify({ ok: true, data: resultados }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error(error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Error desconocido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
