// LicitaAI — Sprint 5: generar-propuesta-tecnica

import { createClient } from "jsr:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@^0.68";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { withRetry } from "../_shared/retry.ts";
import { getEmpresaPerfilActiva } from "../_shared/empresa-perfil.ts";

const SECCIONES_BASE = [
  { id: "portada", titulo: "Portada" },
  { id: "presentacion", titulo: "Presentación de la empresa" },
  { id: "experiencia", titulo: "Experiencia" },
  { id: "especificaciones", titulo: "Especificaciones técnicas ofertadas" },
  { id: "cumplimiento", titulo: "Cumplimiento de normas" },
  { id: "plan_entrega", titulo: "Plan de entrega" },
  { id: "garantias", titulo: "Garantías" },
];

const SECCIONES_SERVICIOS = [
  { id: "metodologia", titulo: "Metodología" },
  { id: "equipo_trabajo", titulo: "Equipo de trabajo" },
  { id: "organigrama", titulo: "Organigrama" },
  { id: "cv_personal", titulo: "CV del personal clave" },
];

const SECCIONES_OBRA = [
  { id: "programa_obra", titulo: "Programa de obra" },
  { id: "personal_tecnico", titulo: "Personal técnico responsable" },
];

function seccionesPara(tipo: string) {
  if (tipo === "SERVICIOS") return [...SECCIONES_BASE, ...SECCIONES_SERVICIOS];
  if (tipo === "OBRA_PUBLICA") return [...SECCIONES_BASE, ...SECCIONES_OBRA];
  return SECCIONES_BASE;
}

const SYSTEM_PROMPT = `Eres un redactor experto en propuestas técnicas para licitaciones públicas mexicanas.
Escribes contenido persuasivo, profesional y conforme a la LAASSP/LOPSRM, basado
estrictamente en los datos de la empresa y del análisis de bases proporcionados.
No inventes datos que no estén en el contexto (certificaciones, clientes, experiencia);
si falta información, usa un marcador de texto entre corchetes como "[Pendiente: dato]".
Responde ÚNICAMENTE con HTML simple compatible con un editor de texto enriquecido:
usa <h2>, <h3>, <p>, <ul>, <li>, <strong>, <em>, <table>/<tr>/<td>. No incluyas
<html>, <head> ni <body>. No agregues comentarios fuera del HTML.`;

async function generarSeccion(
  anthropic: Anthropic,
  seccion: { id: string; titulo: string },
  contexto: string,
): Promise<string> {
  // Streaming evita que el gateway de Edge Functions cierre la conexión por
  // IDLE_TIMEOUT (150s) en generaciones largas con thinking adaptativo.
  const response = await withRetry(() =>
    anthropic.messages
      .stream({
        model: "claude-sonnet-5",
        max_tokens: 4000,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Redacta la sección "${seccion.titulo}" de una propuesta técnica.\n\nContexto:\n${contexto}`,
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

    const { data: licitacion, error: licError } = await supabase
      .from("licitaciones")
      .select("*")
      .eq("id", licitacion_id)
      .single();
    if (licError || !licitacion) throw new Error("Licitación no encontrada");

    const [{ data: analisis }, { data: junta }, empresa] = await Promise.all([
      supabase.from("analisis_bases").select("*").eq("licitacion_id", licitacion_id).maybeSingle(),
      supabase
        .from("junta_aclaraciones")
        .select("respuestas_json")
        .eq("licitacion_id", licitacion_id)
        .maybeSingle(),
      getEmpresaPerfilActiva(supabase, licitacion.organization_id, licitacion.created_by),
    ]);

    const contextoBase = `
Licitación: ${licitacion.titulo} (${licitacion.numero_expediente})
Institución: ${licitacion.institucion}
Tipo: ${licitacion.tipo}

Objeto del contrato: ${analisis?.objeto_contrato ?? "N/D"}
Especificaciones/documentación requerida: ${JSON.stringify(analisis?.documentacion_requerida_json ?? [])}
Criterios de evaluación: ${JSON.stringify(analisis?.criterios_evaluacion_json ?? [])}
Respuestas de la junta de aclaraciones: ${JSON.stringify(junta?.respuestas_json ?? [])}

Empresa:
Razón social: ${empresa?.razon_social ?? "[Pendiente: razón social]"}
RFC: ${empresa?.rfc ?? "[Pendiente: RFC]"}
Giro: ${empresa?.giro ?? "[Pendiente: giro]"}
Años de experiencia: ${empresa?.experiencia_anos ?? "[Pendiente]"}
Certificaciones: ${JSON.stringify(empresa?.certificaciones_json ?? [])}
Clientes de referencia: ${JSON.stringify(empresa?.clientes_referencia_json ?? [])}
`.trim();

    const secciones = seccionesPara(licitacion.tipo);
    const resultado = [];
    for (const seccion of secciones) {
      const html = await generarSeccion(anthropic, seccion, contextoBase);
      resultado.push({ id: seccion.id, titulo: seccion.titulo, html, origen: "ia" });
    }

    await supabase.from("propuestas").delete().eq("licitacion_id", licitacion_id).eq("tipo", "TECNICA");
    const { data: propuesta, error: insertError } = await supabase
      .from("propuestas")
      .insert({
        licitacion_id,
        tipo: "TECNICA",
        version: 1,
        estado: "BORRADOR",
        contenido_json: { secciones: resultado },
      })
      .select()
      .single();

    if (insertError) throw new Error(insertError.message);

    await supabase.from("actividad_log").insert({
      licitacion_id,
      accion: "propuesta_tecnica_generada",
      metadata_json: { secciones: resultado.length },
    });

    return new Response(JSON.stringify({ ok: true, data: propuesta }), {
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
