// LicitaAI — extrae la fecha de emisión de un documento corporativo y,
// cuando el tipo de documento tiene una regla de vigencia conocida,
// calcula hasta cuándo sigue siendo válido.

import Anthropic from "npm:@anthropic-ai/sdk@^0.68";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { withRetry } from "../_shared/retry.ts";
import { authenticate, jsonError, registrarUsoIA, requireDocumentoCorporativo } from "../_shared/auth.ts";
import { contenidoCoincideConNombre } from "../_shared/file-validation.ts";
import { conGuardia } from "../_shared/ai-guard.ts";
import { bloqueDocumentoParaClaude } from "../_shared/anthropic-content-block.ts";
import { modeloInicial, obtenerPoliticaModelo } from "../_shared/model-policy.ts";

const SYSTEM_PROMPT = conGuardia(`Eres un asistente que extrae datos de documentos oficiales mexicanos
(actas, poderes, constancias fiscales, opiniones de cumplimiento, identificaciones, etc.).
Busca la fecha de emisión o expedición del documento. Si el documento indica explícitamente
una fecha de vigencia, vencimiento o "válido hasta", repórtala también. También busca el RFC
y la razón social (o nombre de la persona) a quien pertenece el documento, para poder
verificar que corresponde a la empresa correcta. Además, si el documento es una identificación
oficial, extrae el nombre completo del titular; si es un poder notarial o escrito de
personalidad, extrae el nombre completo de la persona apoderada o reconocida como
representante legal (no el del notario ni el de quien otorga el poder). Si el tipo de
documento lo amerita (acta constitutiva, poder, comprobante de domicilio, declaración de
nacionalidad, estratificación MIPYME o información de socios/accionistas), extrae también
los campos adicionales solicitados en la herramienta: son datos que de otra forma se
transcriben a mano y son propensos a error (números de escritura, notaría, folios de
registro, domicilios completos). Si no puedes determinar un dato con certeza, repórtalo
como null en vez de adivinar — nunca inventes un número de escritura, notaría o folio. Usa
siempre la herramienta proporcionada.`);

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

// Documentos de una PERSONA física (el representante), no de la empresa —
// comparar su RFC/razón social contra los de la empresa (persona moral)
// siempre da un falso "no coincide", porque nunca corresponden por diseño
// (RFC de 13 posiciones vs 12, nombre de persona vs razón social). Para
// estos, la referencia correcta es representante_legal_nombre.
const TIPOS_PERSONA = ["Identificación oficial", "Poder del representante legal", "Escrito de personalidad"];

// Documentos donde el RFC/razón social más visible en el papel casi siempre
// es de UN TERCERO, no de la empresa, y no hay un campo alterno confiable
// contra el cual comparar — un recibo de luz/agua/teléfono imprime en
// grande el RFC de la comisión/compañía proveedora (CFE, Telmex, etc.), no
// necesariamente el del domiciliado. Mejor no verificar que dar un falso
// "no coincide" en casi todos los casos.
const TIPOS_SIN_VERIFICACION_EMPRESA = ["Comprobante de domicilio"];

/** Igual a normalizarNombre/nombresCoinciden en documentos-corporativos-card.tsx
 * — mismo criterio en frontend y backend para no dar veredictos distintos. */
function normalizarNombrePersona(nombre: string): string {
  return nombre
    .toUpperCase()
    .normalize("NFD")
    .replace(/[^A-Z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function nombresPersonaCoinciden(a: string, b: string): boolean {
  const tokensA = normalizarNombrePersona(a).split(" ").filter(Boolean);
  const tokensB = normalizarNombrePersona(b).split(" ").filter(Boolean);
  if (tokensA.length < 2 || tokensB.length < 2) return false;
  const [menor, mayor] = tokensA.length <= tokensB.length ? [tokensA, tokensB] : [tokensB, tokensA];
  const mayorSet = new Set(mayor);
  return menor.every((token) => mayorSet.has(token));
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

/** Para documentos de una persona (identificación, poder, escrito de
 * personalidad): compara el nombre detectado contra el representante legal
 * registrado, no contra el RFC/razón social de la empresa. Si la empresa
 * aún no tiene representante_legal_nombre capturado, no hay con qué
 * comparar — se omite el chequeo en vez de forzar un falso "no coincide". */
function coincidePersona(
  empresa: { representante_legal_nombre: string | null } | null,
  nombrePersonaDetectado: string | null,
): { coincide: boolean | null; motivo: string | null } {
  if (!empresa?.representante_legal_nombre || !nombrePersonaDetectado) {
    return { coincide: null, motivo: null };
  }
  const ok = nombresPersonaCoinciden(nombrePersonaDetectado, empresa.representante_legal_nombre);
  return {
    coincide: ok,
    motivo: ok
      ? null
      : `El nombre detectado en el documento ("${nombrePersonaDetectado}") no coincide con el representante ` +
        `legal registrado en la empresa ("${empresa.representante_legal_nombre}"). Verifica que sea la persona ` +
        `correcta, o actualiza el representante legal en Configuración si cambió.`,
  };
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

    const { data: empresa } = await supabase
      .from("empresa_perfil")
      .select("rfc, razon_social, organization_id, representante_legal_nombre")
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

    const politicaModelo = await obtenerPoliticaModelo(supabase, empresa?.organization_id ?? "");
    const modelo = modeloInicial(politicaModelo);

    const response = await withRetry(() =>
      anthropic.messages.create({
        model: modelo,
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
      modelo,
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
    // Los documentos de una persona (identificación, poder, escrito de
    // personalidad) se verifican contra el representante legal registrado,
    // no contra el RFC/razón social de la empresa — comparar contra la
    // empresa ahí siempre daría un falso "no coincide" (ver coincidePersona).
    // Los de TIPOS_SIN_VERIFICACION_EMPRESA no se verifican en absoluto: el
    // RFC/razón social que traen no es confiablemente el de la empresa.
    const { coincide, motivo: motivoNoCoincide } = TIPOS_PERSONA.includes(documento.tipo)
      ? coincidePersona(empresa, datos.nombre_persona_detectado)
      : TIPOS_SIN_VERIFICACION_EMPRESA.includes(documento.tipo)
        ? { coincide: null, motivo: null }
        : coincideEmpresa(empresa, datos.rfc_detectado, datos.razon_social_detectada);

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
          modelo,
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
