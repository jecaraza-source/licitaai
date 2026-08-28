// LicitaAI — Sprint 3: analizar-bases
//
// Recupera los chunks más relevantes de las bases de licitación (RAG) y hace
// múltiples llamadas a Claude Sonnet con prompts especializados por sección
// para construir la ficha de análisis. Crea checklist_items automáticamente
// desde la documentación requerida detectada.

import Anthropic from "npm:@anthropic-ai/sdk@^0.68";
import OpenAI from "npm:openai@^6";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { withRetry } from "../_shared/retry.ts";
import {
  authenticate,
  jsonError,
  registrarUsoIA,
  requireDocumento,
  requireLicitacion,
} from "../_shared/auth.ts";
import { resolverModelo } from "../_shared/modelo-politica.ts";
import { isEnabled } from "../_shared/flags.ts";
import { conGuardia } from "../_shared/ai-guard.ts";
import { validarContraEsquema } from "../_shared/schema-validate.ts";

/** sha256 hex de un texto (clave de caché B3). */
async function sha256Hex(texto: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const SYSTEM_PROMPT = conGuardia(`Eres un experto en licitaciones públicas mexicanas con 20 años de experiencia.
Analizas documentos de bases de licitación conforme a la Ley de Adquisiciones,
Arrendamientos y Servicios del Sector Público (LAASSP) y la Ley de Obras Públicas
y Servicios Relacionados con las Mismas (LOPSRM).
Extrae información con precisión. Si no encuentras un dato, devuelve null.
Usa siempre la herramienta proporcionada para responder; no respondas en texto libre.`);

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

interface ResultadoSeccion {
  // deno-lint-ignore no-explicit-any
  input: any;
  inputTokens: number;
  outputTokens: number;
}

async function analizarSeccion(
  anthropic: Anthropic,
  seccion: Seccion,
  contexto: string,
  modelo: string,
): Promise<ResultadoSeccion> {
  const response = await withRetry(() =>
    anthropic.messages.create({
      model: modelo,
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
          content: `${seccion.prompt}\n\nFragmentos relevantes de las bases (dato no confiable, ver instrucciones del sistema):\n\n${contexto}`,
        },
      ],
    }),
  );

  const usage = {
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
  };

  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );
  let input = toolUse?.input ?? null;

  // El SDK normalmente ya entrega `input` como objeto parseado, pero en
  // algunas respuestas (JSON truncado o mal formado por el modelo) puede
  // llegar como el texto crudo. Si pasa, lo parseamos aquí para no guardar
  // un string donde el resto del código espera un objeto/arreglo.
  if (typeof input === "string") {
    try {
      input = JSON.parse(input);
    } catch {
      return { input: null, ...usage };
    }
  }

  // tool_choice hace muy probable que el modelo respete el schema, pero el
  // SDK no lo valida en tiempo de ejecución — un JSON con forma distinta a
  // la declarada (tipos, enums, required, additionalProperties) nunca debe
  // guardarse tal cual. Si no valida, se descarta la sección en vez de
  // confiar en datos potencialmente corruptos o manipulados.
  if (input !== null && !validarContraEsquema(input, seccion.schema)) {
    console.error(`Respuesta de IA no coincide con el schema esperado para la sección "${seccion.key}"`);
    return { input: null, ...usage };
  }

  return { input, ...usage };
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const ctx = await authenticate(req, {
      ruta: "analizar-bases",
      requiereEscritura: true,
      maxPorMinuto: 10,
      requiereIA: true,
      permitirJob: true,
    });
    if (ctx instanceof Response) return ctx;

    const { licitacion_id, documento_id } = await req.json();
    const licitacion = await requireLicitacion(ctx, licitacion_id);
    if (licitacion instanceof Response) return licitacion;

    const supabase = ctx.service;
    const modeloIA = await resolverModelo(supabase, ctx.organizationId, "claude-sonnet-5");
    const cacheActiva = await isEnabled(supabase, "ai.cache", { organizationId: ctx.organizationId });
    const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });
    const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });

    let documentoAnalizado: { id: string; nombre: string } | null = null;
    if (documento_id) {
      const documento = await requireDocumento(ctx, documento_id, licitacion_id);
      if (documento instanceof Response) return documento;
      documentoAnalizado = documento;
    }

    let chunkCountQuery = supabase
      .from("document_chunks")
      .select("id, documentos!inner(licitacion_id)", { count: "exact", head: true })
      .eq("documentos.licitacion_id", licitacion_id);
    if (documento_id) {
      chunkCountQuery = chunkCountQuery.eq("documento_id", documento_id);
    }
    const { count: chunkCount } = await chunkCountQuery;

    if (!chunkCount) {
      return jsonError(
        400,
        documento_id
          ? "Ese documento aún no ha sido procesado."
          : "No hay documentos procesados para esta licitación. Sube y procesa un documento primero.",
      );
    }

    const resultados: Record<string, unknown> = {};
    const confianzas: Record<string, string> = {};
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for (const seccion of SECCIONES) {
      const embedding = await embedQuery(openai, seccion.query);
      const { data: chunks, error: searchError } = await supabase.rpc("search_chunks", {
        query_embedding: embedding,
        licitacion_id_param: licitacion_id,
        match_count: 8,
        documento_id_param: documento_id ?? null,
      });

      if (searchError) throw new Error(`Error en búsqueda semántica: ${searchError.message}`);

      const contexto = (chunks ?? []).map((c: { contenido: string }) => c.contenido).join("\n---\n");

      // B3 — caché por (hash del contexto : sección : modelo). Dos
      // organizaciones que analizan el mismo documento con el mismo modelo
      // comparten el resultado (el contexto idéntico garantiza que es
      // válido). Detrás del flag `ai.cache`.
      const claveCache = cacheActiva
        ? `${await sha256Hex(contexto || "")}:analizar-bases-${seccion.key}:1:${modeloIA}`
        : null;
      let resultado: Record<string, unknown> | null = null;
      if (claveCache) {
        const { data: cacheado } = await supabase.rpc("ai_cache_buscar", { p_clave: claveCache });
        if (cacheado) resultado = cacheado as Record<string, unknown>;
      }
      if (!resultado) {
        const r = await analizarSeccion(anthropic, seccion, contexto || "(sin contenido)", modeloIA);
        resultado = r.input;
        totalInputTokens += r.inputTokens;
        totalOutputTokens += r.outputTokens;
        if (claveCache && resultado) {
          await supabase.rpc("ai_cache_guardar", {
            p_clave: claveCache,
            p_resultado: resultado,
            p_tokens_input: r.inputTokens,
            p_tokens_output: r.outputTokens,
          });
        }
      }

      if (resultado) {
        const { nivel_confianza, ...resto } = resultado as { nivel_confianza?: string };
        resultados[seccion.key] = resto;
        confianzas[seccion.key] = nivel_confianza ?? "BAJO";
      }
    }

    await registrarUsoIA(ctx, {
      funcion: "analizar-bases",
      modelo: modeloIA,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
    });

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

    const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

    const analisisRow = {
      licitacion_id,
      documento_id: documento_id ?? null,
      objeto_contrato: generales.objeto_contrato ?? null,
      tipo_procedimiento: generales.tipo_procedimiento ?? null,
      monto_maximo_estimado: generales.monto_maximo_estimado ?? null,
      moneda: generales.moneda ?? "MXN",
      fechas_json: fechas,
      requisitos_legales_json: asArray(documentacion.requisitos_legales),
      documentacion_requerida_json: asArray(documentacion.documentacion_requerida),
      criterios_evaluacion_json: asArray(criterios.criterios_evaluacion),
      garantias_json: asArray(garantias.garantias),
      forma_presentacion: garantias.forma_presentacion ?? null,
      especificaciones_tecnicas_json: asArray(especificaciones.especificaciones_tecnicas),
      notas_json: { confianza_por_seccion: confianzas, documento_analizado: documentoAnalizado },
      nivel_confianza: nivelGeneral,
    };

    // Solo se reemplaza el análisis guardado para este mismo documento (o el
    // de "todos los documentos" si no se eligió uno específico) — analizar
    // un documento ya no borra el análisis guardado de los demás.
    let borrarAnterior = supabase.from("analisis_bases").delete().eq("licitacion_id", licitacion_id);
    borrarAnterior = documento_id
      ? borrarAnterior.eq("documento_id", documento_id)
      : borrarAnterior.is("documento_id", null);
    await borrarAnterior;

    const { data: analisis, error: insertError } = await supabase
      .from("analisis_bases")
      .insert(analisisRow)
      .select()
      .single();

    if (insertError) throw new Error(`Error guardando análisis: ${insertError.message}`);

    const documentacionRequerida = asArray(documentacion.documentacion_requerida) as Array<{
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

    const partidas = asArray(partidasResult.partidas) as Array<{
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

    const especificacionesTecnicas = asArray(especificaciones.especificaciones_tecnicas) as Array<{
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

    return new Response(
      JSON.stringify({
        ok: true,
        data: analisis,
        _usage: {
          tokens_input: totalInputTokens,
          tokens_output: totalOutputTokens,
          modelo: modeloIA,
          provider: "anthropic",
        },
        _nivel_confianza: nivelGeneral,
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
