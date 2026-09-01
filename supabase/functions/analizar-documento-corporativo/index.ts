// LicitaAI — extrae la fecha de emisión de un documento corporativo y,
// cuando el tipo de documento tiene una regla de vigencia conocida,
// calcula hasta cuándo sigue siendo válido.

import Anthropic from "npm:@anthropic-ai/sdk@^0.68";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { withRetry } from "../_shared/retry.ts";
import { authenticate, jsonError, registrarUsoIA, requireDocumentoCorporativo } from "../_shared/auth.ts";
import { resolverModelo } from "../_shared/modelo-politica.ts";
import { contenidoCoincideConNombre } from "../_shared/file-validation.ts";
import { conGuardia } from "../_shared/ai-guard.ts";
import { bloqueDocumentoParaClaude } from "../_shared/anthropic-content-block.ts";

const SYSTEM_PROMPT = conGuardia(`Eres un asistente que extrae datos de documentos oficiales mexicanos
(actas, poderes, constancias fiscales, opiniones de cumplimiento, identificaciones, etc.).
Busca la fecha de emisión o expedición del documento. Si el documento indica explícitamente
una fecha de vigencia, vencimiento o "válido hasta", repórtala también. También busca el RFC
y la razón social (o nombre de la persona) a quien pertenece el documento, para poder
verificar que corresponde a la empresa correcta. Además, si el documento es una identificación
oficial, extrae el nombre completo del titular; si es un poder notarial o escrito de
personalidad, extrae el nombre completo de la persona apoderada o reconocida como
representante legal (no el del notario ni el de quien otorga el poder).

Si el tipo de documento lo amerita (acta constitutiva, poder, comprobante de domicilio,
constancia de situación fiscal, declaración de nacionalidad, estratificación MIPYME o
información de socios/accionistas), extrae también los campos adicionales solicitados en
la herramienta: son datos que de otra
forma se transcriben a mano y son propensos a error (números de escritura, notaría, folios
de registro, domicilios completos). Para un acta constitutiva o un poder notarial, revisa
TODO el documento (no solo el primer párrafo) antes de reportar alguno de estos campos como
null — casi siempre aparecen en:
- El encabezado o carátula del instrumento: "ESCRITURA PÚBLICA NÚMERO ___", "ANTE MÍ,
  [nombre del notario], NOTARIO PÚBLICO NÚMERO ___ DE [ciudad/estado]" o "TITULAR DE LA
  NOTARÍA PÚBLICA NÚMERO ___".
- El pie de la última página, junto a la firma y el sello del notario.
- El sello o anotación de inscripción del Registro Público de Comercio (folio mercantil
  electrónico, número de folio, fecha de inscripción), que puede estar en una página aparte
  al final del documento escaneado.

Un documento puede llegar como varias páginas escaneadas juntas: no concluyas que un dato
falta sin haber revisado todas las páginas que recibiste. Aun así, si genuinamente no
aparece en el documento, repórtalo como null en vez de adivinar — nunca inventes un número
de escritura, notaría o folio.

Si el tipo de documento es "Comprobante de domicilio" (recibo de luz, agua, gas, teléfono u
otro servicio): el recibo casi siempre trae, en el encabezado o pie de página, el RFC y/o la
razón social de QUIEN EMITE el recibo (la comercializadora o el organismo — p. ej. CFE,
Telmex, el organismo operador de agua). Ese RFC y esa razón social pertenecen al PROVEEDOR
del servicio, no a la empresa o persona que presenta el comprobante — aunque aparezcan en el
mismo documento, nunca los reportes como rfc_detectado/razon_social_detectada. Repórtalos
únicamente si el documento indica explícitamente el RFC o el nombre DEL TITULAR/CLIENTE del
servicio (el recuadro de "nombre del usuario", "contratante" o similar); si el titular
aparece solo como nombre sin RFC junto a él, reporta razon_social_detectada con ese nombre y
rfc_detectado como null — no lo confundas con el RFC del proveedor. El domicilio completo
(domicilio_fiscal) sí debe extraerse siempre que sea legible, tenga o no el recibo un RFC del
titular.

Usa siempre la herramienta proporcionada.`);

const TOOL_SCHEMA_BASE_PROPERTIES = {
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
  nombre_persona_detectado: {
    type: ["string", "null"],
    description:
      "Nombre completo del titular (si es una identificación oficial) o del apoderado/representante legal nombrado (si es un poder o escrito de personalidad). Null si no aplica o no se detecta.",
  },
};
const TOOL_SCHEMA_BASE_REQUIRED = Object.keys(TOOL_SCHEMA_BASE_PROPERTIES);

// Campos legales adicionales por tipo de documento, con nombres de clave
// idénticos a las columnas de empresa_perfil que llenan (para que el
// prellenado en Configuración sea un merge directo por nombre de campo).
const CAMPOS_ACTA = {
  objeto_social: {
    type: ["string", "null"],
    description: "Objeto social de la empresa según el acta constitutiva, o null",
  },
  acta_escritura_numero: {
    type: ["string", "null"],
    description: "Número de la escritura pública del acta constitutiva, o null",
  },
  acta_escritura_fecha: {
    type: ["string", "null"],
    description: "Fecha de la escritura pública del acta constitutiva en formato YYYY-MM-DD, o null",
  },
  acta_notario: {
    type: ["string", "null"],
    description: "Nombre completo del notario público que dio fe del acta constitutiva, o null",
  },
  acta_notaria_numero: {
    type: ["string", "null"],
    description: "Número de la notaría del notario que dio fe del acta constitutiva, o null",
  },
  acta_notaria_estado: {
    type: ["string", "null"],
    description: "Estado (entidad federativa) donde se ubica la notaría del acta constitutiva, o null",
  },
  acta_registro_publico: {
    type: ["string", "null"],
    description: "Folio y datos de inscripción del acta en el Registro Público de Comercio, o null",
  },
};

const CAMPOS_REPRESENTANTE = {
  representante_legal_escritura_numero: {
    type: ["string", "null"],
    description: "Número de la escritura pública del poder o escrito de personalidad, o null",
  },
  representante_legal_escritura_fecha: {
    type: ["string", "null"],
    description: "Fecha de la escritura pública del poder en formato YYYY-MM-DD, o null",
  },
  representante_legal_notario: {
    type: ["string", "null"],
    description: "Nombre completo del notario público que dio fe del poder, o null",
  },
  representante_legal_notaria_numero: {
    type: ["string", "null"],
    description: "Número de la notaría del notario que dio fe del poder, o null",
  },
  representante_legal_notaria_estado: {
    type: ["string", "null"],
    description: "Estado (entidad federativa) donde se ubica la notaría del poder, o null",
  },
  representante_legal_registro_publico: {
    type: ["string", "null"],
    description: "Folio y datos de inscripción del poder en el Registro Público de Comercio, si aplica, o null",
  },
};

const CAMPOS_DOMICILIO = {
  domicilio_fiscal: {
    type: ["string", "null"],
    description:
      "Domicilio completo (calle, número, colonia, municipio/alcaldía, estado, código postal) que aparece en el documento, o null",
  },
};

const CAMPOS_NACIONALIDAD = {
  nacionalidad: {
    type: ["string", "null"],
    description: "Nacionalidad declarada de la empresa o persona, o null",
  },
};

const CAMPOS_MIPYME = {
  estratificacion_mipyme: {
    type: ["string", "null"],
    description: "Estratificación MIPYME declarada (Microempresa, Pequeña empresa o Mediana empresa), o null",
  },
};

const CAMPOS_SOCIOS = {
  socios_accionistas_json: {
    type: ["array", "null"],
    items: { type: "string" },
    description:
      "Lista de socios o accionistas con control sobre la sociedad, uno por elemento con su porcentaje de participación (ej. 'Juan Pérez López - 50%'), o null si no se detecta",
  },
};

const CAMPOS_EXTRA_POR_TIPO: Record<string, Record<string, unknown>> = {
  "Acta constitutiva": CAMPOS_ACTA,
  Reformas: CAMPOS_ACTA,
  "Poder del representante legal": CAMPOS_REPRESENTANTE,
  "Escrito de personalidad": CAMPOS_REPRESENTANTE,
  "Comprobante de domicilio": CAMPOS_DOMICILIO,
  // La Constancia de Situación Fiscal del SAT trae su propia sección de
  // "Domicilio Registrado" — es la fuente más confiable para domicilio_fiscal
  // (un comprobante de domicilio genérico puede corresponder a otro domicilio).
  "Constancia de Situación Fiscal": CAMPOS_DOMICILIO,
  "Declaración de nacionalidad": CAMPOS_NACIONALIDAD,
  "Estratificación MIPYME": CAMPOS_MIPYME,
  "Información de socios/accionistas": CAMPOS_SOCIOS,
};

function construirToolSchema(tipo: string) {
  const extra = CAMPOS_EXTRA_POR_TIPO[tipo] ?? {};
  return {
    type: "object" as const,
    properties: { ...TOOL_SCHEMA_BASE_PROPERTIES, ...extra },
    required: [...TOOL_SCHEMA_BASE_REQUIRED, ...Object.keys(extra)],
    additionalProperties: false,
  };
}

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
 * coincide: true = coincide, false = no coincide, null = el documento no
 *   traía RFC ni razón social para comparar (p. ej. un comprobante de domicilio).
 * motivo: cuando coincide === false, explicación legible de por qué; null en el resto.
 */
function coincideEmpresa(
  empresa: { rfc: string | null; razon_social: string | null } | null,
  rfcDetectado: string | null,
  razonSocialDetectada: string | null,
): { coincide: boolean | null; motivo: string | null } {
  if (!empresa) return { coincide: null, motivo: null };

  if (rfcDetectado && empresa.rfc) {
    const ok = normalizarTexto(rfcDetectado) === normalizarTexto(empresa.rfc);
    return {
      coincide: ok,
      motivo: ok
        ? null
        : `El RFC del documento (${rfcDetectado}) no coincide con el de tu empresa activa (${empresa.rfc}). ` +
          `Puede que el documento sea de otra empresa o que hayas seleccionado la empresa equivocada.`,
    };
  }

  if (razonSocialDetectada && empresa.razon_social) {
    const detectada = normalizarTexto(razonSocialDetectada);
    const propia = normalizarTexto(empresa.razon_social);
    const ok = detectada === propia || detectada.includes(propia) || propia.includes(detectada);
    return {
      coincide: ok,
      motivo: ok
        ? null
        : `La razón social del documento ("${razonSocialDetectada}") no coincide con la de tu empresa activa ` +
          `("${empresa.razon_social}"). El documento no trae RFC para verificar; revísalo.`,
    };
  }

  return { coincide: null, motivo: null };
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
    const ctx = await authenticate(req, {
      ruta: "analizar-documento-corporativo",
      requiereEscritura: true,
      maxPorMinuto: 20,
      requiereIA: true,
      permitirJob: true,
    });
    if (ctx instanceof Response) return ctx;

    const { documento_id, fecha_emision_manual } = await req.json();
    const documento = await requireDocumentoCorporativo(ctx, documento_id);
    if (documento instanceof Response) return documento;

    const supabase = ctx.service;
    const modeloIA = await resolverModelo(supabase, ctx.organizationId, "claude-sonnet-5");

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

    const { data: archivo, error: downloadError } = await supabase.storage
      .from("documentos-corporativos")
      .download(documento.storage_path);
    if (downloadError || !archivo) throw new Error("No se pudo descargar el documento");

    const fileBytes = new Uint8Array(await archivo.arrayBuffer());

    // El allowlist de Storage solo valida el Content-Type declarado al
    // subir; esto valida el CONTENIDO real antes de enviarlo a Claude. Se
    // hace antes de construir el cliente de Anthropic para no gastar nada
    // en un archivo que se va a rechazar.
    if (!contenidoCoincideConNombre(fileBytes, documento.nombre)) {
      return jsonError(422, "El contenido del archivo no corresponde a su nombre/extensión");
    }

    const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });
    const base64 = uint8ArrayToBase64(fileBytes);
    const mediaType = documento.nombre.toLowerCase().endsWith(".pdf")
      ? "application/pdf"
      : "image/jpeg";

    const response = await withRetry(() =>
      anthropic.messages.create({
        model: modeloIA,
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        tools: [
          {
            name: "reportar_fechas",
            description: "Reporta las fechas y datos detectados en el documento",
            input_schema: construirToolSchema(documento.tipo),
          },
        ],
        tool_choice: { type: "tool", name: "reportar_fechas" },
        messages: [
          {
            role: "user",
            content: [
              bloqueDocumentoParaClaude(mediaType, base64),
              { type: "text", text: `Tipo de documento: ${documento.tipo}` },
            ],
          },
        ],
      }),
    );

    await registrarUsoIA(ctx, {
      funcion: "analizar-documento-corporativo",
      modelo: modeloIA,
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
    });

    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    const datos = toolUse?.input as
      | {
          fecha_emision: string | null;
          fecha_vigencia_indicada: string | null;
          rfc_detectado: string | null;
          razon_social_detectada: string | null;
          nombre_persona_detectado: string | null;
        } & Record<string, unknown>
      | undefined;
    if (!datos) throw new Error("No se pudieron extraer datos del documento");

    const vigenciaHasta =
      datos.fecha_vigencia_indicada ?? calcularVigenciaHasta(documento.tipo, datos.fecha_emision);
    const { coincide, motivo: motivoNoCoincide } = coincideEmpresa(
      empresa,
      datos.rfc_detectado,
      datos.razon_social_detectada,
    );

    // Solo se guardan las claves extra propias del tipo de documento, y solo
    // las que la IA sí pudo detectar (no se pisan datos con null).
    const camposExtra = CAMPOS_EXTRA_POR_TIPO[documento.tipo] ?? {};
    const datosExtraidos: Record<string, unknown> = {};
    for (const campo of Object.keys(camposExtra)) {
      const valor = datos[campo];
      if (valor !== null && valor !== undefined && !(Array.isArray(valor) && valor.length === 0)) {
        datosExtraidos[campo] = valor;
      }
    }

    await supabase
      .from("documentos_corporativos")
      .update({
        fecha_emision: datos.fecha_emision,
        vigencia_hasta: vigenciaHasta,
        coincide_empresa: coincide,
        rfc_detectado: datos.rfc_detectado,
        razon_social_detectada: datos.razon_social_detectada,
        motivo_no_coincide: motivoNoCoincide,
        nombre_persona_detectado: datos.nombre_persona_detectado,
        datos_extraidos_json: datosExtraidos,
      })
      .eq("id", documento_id);

    return new Response(
      JSON.stringify({
        ok: true,
        data: {
          fecha_emision: datos.fecha_emision,
          vigencia_hasta: vigenciaHasta,
          coincide_empresa: coincide,
          rfc_detectado: datos.rfc_detectado,
          razon_social_detectada: datos.razon_social_detectada,
          motivo_no_coincide: motivoNoCoincide,
          nombre_persona_detectado: datos.nombre_persona_detectado,
          datos_extraidos_json: datosExtraidos,
        },
        _usage: {
          tokens_input: response.usage?.input_tokens ?? 0,
          tokens_output: response.usage?.output_tokens ?? 0,
          modelo: modeloIA,
          provider: "anthropic",
        },
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
