// LicitaAI — Sprint 3: analizar-bases
//
// Recupera los chunks más relevantes de las bases de licitación (RAG) y hace
// múltiples llamadas a Claude Sonnet con prompts especializados por sección
// para construir la ficha de análisis. Crea checklist_items automáticamente
// desde la documentación requerida detectada.

import { createClient } from "jsr:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@^0.68";
import OpenAI from "npm:openai@^6";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { withRetry } from "../_shared/retry.ts";

const SYSTEM_PROMPT = `Eres un experto en licitaciones públicas mexicanas con 20 años de experiencia.
Analizas documentos de bases de licitación conforme a la Ley de Adquisiciones,
Arrendamientos y Servicios del Sector Público (LAASSP) y la Ley de Obras Públicas
y Servicios Relacionados con las Mismas (LOPSRM).
Extrae información con precisión. Si no encuentras un dato, devuelve null.
Usa siempre la herramienta proporcionada para responder; no respondas en texto libre.`;

type Seccion = {
  key: string;
  query: string;
  toolName: string;
  toolDescription: string;
  schema: Record<string, unknown>;
  prompt: string;
};

const SECCIONES: Seccion[] = [
  {
    key: "generales",
    query: "objeto del contrato, tipo de procedimiento, institución convocante, monto máximo",
    toolName: "reportar_datos_generales",
    toolDescription: "Reporta los datos generales del contrato",
    schema: {
      type: "object",
      properties: {
        objeto_contrato: { type: ["string", "null"] },
        tipo_procedimiento: { type: ["string", "null"] },
        monto_maximo_estimado: { type: ["number", "null"] },
        moneda: { type: ["string", "null"] },
        nivel_confianza: { type: "string", enum: ["ALTO", "MEDIO", "BAJO"] },
      },
      required: [
        "objeto_contrato",
        "tipo_procedimiento",
        "monto_maximo_estimado",
        "moneda",
        "nivel_confianza",
      ],
      additionalProperties: false,
    },
    prompt:
      "Extrae el objeto del contrato, el tipo de procedimiento de contratación, el monto máximo estimado y la moneda.",
  },
  {
    key: "fechas",
    query:
      "fechas de publicación, junta de aclaraciones, visita a instalaciones, entrega de propuestas, apertura técnica, apertura económica, fallo",
    toolName: "reportar_fechas",
    toolDescription: "Reporta las fechas clave del procedimiento",
    schema: {
      type: "object",
      properties: {
        fecha_publicacion: { type: ["string", "null"] },
        fecha_junta_aclaraciones: { type: ["string", "null"] },
        fecha_visita: { type: ["string", "null"] },
        fecha_entrega_propuesta: { type: ["string", "null"] },
        fecha_apertura_tecnica: { type: ["string", "null"] },
        fecha_apertura_economica: { type: ["string", "null"] },
        fecha_fallo: { type: ["string", "null"] },
        nivel_confianza: { type: "string", enum: ["ALTO", "MEDIO", "BAJO"] },
      },
      required: [
        "fecha_publicacion",
        "fecha_junta_aclaraciones",
        "fecha_visita",
        "fecha_entrega_propuesta",
        "fecha_apertura_tecnica",
        "fecha_apertura_economica",
        "fecha_fallo",
        "nivel_confianza",
      ],
      additionalProperties: false,
    },
    prompt:
      "Extrae todas las fechas del procedimiento en formato ISO 8601 (YYYY-MM-DDTHH:mm:ss), si solo hay fecha sin hora usa T00:00:00.",
  },
  {
    key: "documentacion",
    query:
      "documentación legal, fiscal y técnica requerida, requisitos de participación, formatos y vigencias",
    toolName: "reportar_documentacion",
    toolDescription: "Reporta requisitos legales y documentación requerida",
    schema: {
      type: "object",
      properties: {
        requisitos_legales: { type: "array", items: { type: "string" } },
        documentacion_requerida: {
          type: "array",
          items: {
            type: "object",
            properties: {
              descripcion: { type: "string" },
              categoria: {
                type: "string",
                enum: ["LEGAL", "FISCAL", "TECNICO", "ECONOMICO", "ESPECIFICO"],
              },
              fundamento_legal: { type: ["string", "null"] },
              vigencia_requerida: { type: ["string", "null"] },
              formato_aceptado: { type: ["string", "null"] },
              requerido: { type: "boolean" },
              tipo_formato: {
                type: ["string", "null"],
                enum: ["A", "B", "C", "D", null],
              },
            },
            required: [
              "descripcion",
              "categoria",
              "fundamento_legal",
              "vigencia_requerida",
              "formato_aceptado",
              "requerido",
              "tipo_formato",
            ],
            additionalProperties: false,
          },
        },
        nivel_confianza: { type: "string", enum: ["ALTO", "MEDIO", "BAJO"] },
      },
      required: ["requisitos_legales", "documentacion_requerida", "nivel_confianza"],
      additionalProperties: false,
    },
    prompt:
      "Extrae la lista de requisitos legales generales y el checklist detallado de documentación requerida para participar. Para cada uno, clasifica tipo_formato: A si es un formato obligatorio que debe usarse exactamente sin modificaciones, B si es un formato modelo que se puede llenar o adaptar, C si es un escrito libre pero con texto obligatorio exigido, D si es un documento emitido por un tercero (SAT, IMSS, banco, fabricante, etc.). Usa null solo si genuinamente no aplica ninguna categoría.",
  },
  {
    key: "criterios",
    query: "criterios de evaluación, ponderación, puntos y porcentajes, metodología de evaluación",
    toolName: "reportar_criterios",
    toolDescription: "Reporta los criterios de evaluación de propuestas",
    schema: {
      type: "object",
      properties: {
        criterios_evaluacion: {
          type: "array",
          items: {
            type: "object",
            properties: {
              criterio: { type: "string" },
              ponderacion_porcentaje: { type: ["number", "null"] },
              descripcion: { type: ["string", "null"] },
            },
            required: ["criterio", "ponderacion_porcentaje", "descripcion"],
            additionalProperties: false,
          },
        },
        nivel_confianza: { type: "string", enum: ["ALTO", "MEDIO", "BAJO"] },
      },
      required: ["criterios_evaluacion", "nivel_confianza"],
      additionalProperties: false,
    },
    prompt: "Extrae los criterios de evaluación de las propuestas y su ponderación.",
  },
  {
    key: "garantias",
    query: "garantías, fianzas, forma de presentación de propuestas, condiciones",
    toolName: "reportar_garantias",
    toolDescription: "Reporta garantías requeridas y forma de presentación",
    schema: {
      type: "object",
      properties: {
        garantias: {
          type: "array",
          items: {
            type: "object",
            properties: {
              tipo: { type: "string" },
              monto_o_porcentaje: { type: ["string", "null"] },
              vigencia: { type: ["string", "null"] },
              descripcion: { type: ["string", "null"] },
            },
            required: ["tipo", "monto_o_porcentaje", "vigencia", "descripcion"],
            additionalProperties: false,
          },
        },
        forma_presentacion: { type: ["string", "null"] },
        nivel_confianza: { type: "string", enum: ["ALTO", "MEDIO", "BAJO"] },
      },
      required: ["garantias", "forma_presentacion", "nivel_confianza"],
      additionalProperties: false,
    },
    prompt: "Extrae las garantías/fianzas requeridas y la forma de presentación de la propuesta.",
  },
  {
    key: "especificaciones",
    query:
      "especificaciones técnicas, personal requerido, perfiles, certificaciones, equipamiento, características mínimas, normas aplicables, niveles de servicio, entregables, plazos",
    toolName: "reportar_especificaciones_tecnicas",
    toolDescription: "Reporta cada especificación técnica de cumplimiento obligatorio como un renglón independiente",
    schema: {
      type: "object",
      properties: {
        especificaciones_tecnicas: {
          type: "array",
          items: {
            type: "object",
            properties: {
              especificacion: { type: "string" },
              cantidad: { type: ["string", "null"] },
              obligatorio: { type: "boolean" },
            },
            required: ["especificacion", "cantidad", "obligatorio"],
            additionalProperties: false,
          },
        },
        nivel_confianza: { type: "string", enum: ["ALTO", "MEDIO", "BAJO"] },
      },
      required: ["especificaciones_tecnicas", "nivel_confianza"],
      additionalProperties: false,
    },
    prompt:
      "Extrae cada especificación técnica u obligación de cumplimiento exigida en el Anexo Técnico como un renglón independiente (personal, perfiles, certificaciones, equipamiento, características mínimas, normas, niveles de servicio, plazos, entregables). No agrupes varias exigencias en un solo renglón: si el documento pide '5 especialistas certificados', repórtalo como una especificación que exige acreditar 5 especialistas con certificación, no como una sola línea genérica de 'personal'.",
  },
  {
    key: "partidas",
    query: "partidas, conceptos, cantidades, unidades de medida, especificaciones técnicas",
    toolName: "reportar_partidas",
    toolDescription: "Reporta las partidas o conceptos a contratar",
    schema: {
      type: "object",
      properties: {
        partidas: {
          type: "array",
          items: {
            type: "object",
            properties: {
              numero: { type: "string" },
              descripcion: { type: "string" },
              unidad: { type: ["string", "null"] },
              cantidad: { type: ["number", "null"] },
            },
            required: ["numero", "descripcion", "unidad", "cantidad"],
            additionalProperties: false,
          },
        },
        nivel_confianza: { type: "string", enum: ["ALTO", "MEDIO", "BAJO"] },
      },
      required: ["partidas", "nivel_confianza"],
      additionalProperties: false,
    },
    prompt: "Extrae la lista de partidas o conceptos a contratar con su cantidad y unidad.",
  },
];

const NIVEL_RANGO: Record<string, number> = { BAJO: 1, MEDIO: 2, ALTO: 3 };
const RANGO_A_NIVEL: Record<number, string> = { 1: "BAJO", 2: "MEDIO", 3: "ALTO" };

async function embedQuery(openai: OpenAI, query: string): Promise<number[]> {
  const response = await withRetry(() =>
    openai.embeddings.create({ model: "text-embedding-3-small", input: query }),
  );
  return response.data[0].embedding;
}

// deno-lint-ignore no-explicit-any
async function analizarSeccion(anthropic: Anthropic, seccion: Seccion, contexto: string): Promise<any> {
  const response = await withRetry(() =>
    anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      tools: [
        {
          name: seccion.toolName,
          description: seccion.toolDescription,
          input_schema: seccion.schema as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: "tool", name: seccion.toolName },
      messages: [
        {
          role: "user",
          content: `${seccion.prompt}\n\nFragmentos relevantes de las bases:\n\n${contexto}`,
        },
      ],
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
    const { licitacion_id } = await req.json();
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
    const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });

    const { count: chunkCount } = await supabase
      .from("document_chunks")
      .select("id, documentos!inner(licitacion_id)", { count: "exact", head: true })
      .eq("documentos.licitacion_id", licitacion_id);

    if (!chunkCount) {
      return new Response(
        JSON.stringify({
          error: "No hay documentos procesados para esta licitación. Sube y procesa un documento primero.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const resultados: Record<string, unknown> = {};
    const confianzas: Record<string, string> = {};

    for (const seccion of SECCIONES) {
      const embedding = await embedQuery(openai, seccion.query);
      const { data: chunks, error: searchError } = await supabase.rpc("search_chunks", {
        query_embedding: embedding,
        licitacion_id_param: licitacion_id,
        match_count: 8,
      });

      if (searchError) throw new Error(`Error en búsqueda semántica: ${searchError.message}`);

      const contexto = (chunks ?? []).map((c: { contenido: string }) => c.contenido).join("\n---\n");
      const resultado = await analizarSeccion(anthropic, seccion, contexto || "(sin contenido)");

      if (resultado) {
        const { nivel_confianza, ...resto } = resultado;
        resultados[seccion.key] = resto;
        confianzas[seccion.key] = nivel_confianza ?? "BAJO";
      }
    }

    const generales = (resultados.generales ?? {}) as Record<string, unknown>;
    const fechas = (resultados.fechas ?? {}) as Record<string, unknown>;
    const documentacion = (resultados.documentacion ?? {}) as Record<string, unknown>;
    const criterios = (resultados.criterios ?? {}) as Record<string, unknown>;
    const garantias = (resultados.garantias ?? {}) as Record<string, unknown>;
    const especificaciones = (resultados.especificaciones ?? {}) as Record<string, unknown>;
    const partidasResult = (resultados.partidas ?? {}) as Record<string, unknown>;

    const nivelesPresentes = Object.values(confianzas).filter(Boolean);
    const rangoMinimo =
      nivelesPresentes.length > 0
        ? Math.min(...nivelesPresentes.map((n) => NIVEL_RANGO[n] ?? 1))
        : 1;
    const nivelGeneral = RANGO_A_NIVEL[rangoMinimo] ?? "BAJO";

    const analisisRow = {
      licitacion_id,
      objeto_contrato: generales.objeto_contrato ?? null,
      tipo_procedimiento: generales.tipo_procedimiento ?? null,
      monto_maximo_estimado: generales.monto_maximo_estimado ?? null,
      moneda: generales.moneda ?? "MXN",
      fechas_json: fechas,
      requisitos_legales_json: documentacion.requisitos_legales ?? [],
      documentacion_requerida_json: documentacion.documentacion_requerida ?? [],
      criterios_evaluacion_json: criterios.criterios_evaluacion ?? [],
      garantias_json: garantias.garantias ?? [],
      forma_presentacion: garantias.forma_presentacion ?? null,
      especificaciones_tecnicas_json: especificaciones.especificaciones_tecnicas ?? [],
      notas_json: { confianza_por_seccion: confianzas },
      nivel_confianza: nivelGeneral,
    };

    await supabase.from("analisis_bases").delete().eq("licitacion_id", licitacion_id);
    const { data: analisis, error: insertError } = await supabase
      .from("analisis_bases")
      .insert(analisisRow)
      .select()
      .single();

    if (insertError) throw new Error(`Error guardando análisis: ${insertError.message}`);

    const documentacionRequerida = (documentacion.documentacion_requerida ?? []) as Array<{
      descripcion: string;
      categoria: string;
      fundamento_legal: string | null;
      vigencia_requerida: string | null;
      formato_aceptado: string | null;
      requerido: boolean;
      tipo_formato: string | null;
    }>;

    if (documentacionRequerida.length > 0) {
      await supabase.from("checklist_items").delete().eq("licitacion_id", licitacion_id);
      await supabase.from("checklist_items").insert(
        documentacionRequerida.map((item) => ({
          licitacion_id,
          categoria: item.categoria,
          descripcion: item.descripcion,
          fundamento_legal: item.fundamento_legal,
          vigencia_requerida: item.vigencia_requerida,
          formato_aceptado: item.formato_aceptado,
          tipo_formato: item.tipo_formato,
          requerido: item.requerido,
        })),
      );
    }

    const partidas = (partidasResult.partidas ?? []) as Array<{
      numero: string;
      descripcion: string;
      unidad: string | null;
      cantidad: number | null;
    }>;

    if (partidas.length > 0) {
      await supabase.from("partidas").delete().eq("licitacion_id", licitacion_id);
      await supabase.from("partidas").insert(
        partidas.map((p) => ({
          licitacion_id,
          numero: p.numero,
          descripcion: p.descripcion,
          unidad: p.unidad,
          cantidad: p.cantidad,
        })),
      );
    }

    const especificacionesTecnicas = (especificaciones.especificaciones_tecnicas ?? []) as Array<{
      especificacion: string;
      cantidad: string | null;
      obligatorio: boolean;
    }>;

    if (especificacionesTecnicas.length > 0) {
      await supabase.from("requisitos_tecnicos").delete().eq("licitacion_id", licitacion_id);
      await supabase.from("requisitos_tecnicos").insert(
        especificacionesTecnicas.map((e, i) => ({
          licitacion_id,
          orden: i,
          requisito: e.cantidad ? `${e.especificacion} (${e.cantidad})` : e.especificacion,
          obligatorio: e.obligatorio,
        })),
      );
    }

    await supabase.from("actividad_log").insert({
      licitacion_id,
      accion: "analisis_ia",
      metadata_json: { nivel_confianza: nivelGeneral, secciones: Object.keys(resultados) },
    });

    return new Response(JSON.stringify({ ok: true, data: analisis }), {
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
