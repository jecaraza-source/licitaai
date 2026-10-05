import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChecklistLiberacionItem } from "@/types";
import { isEnabled } from "@/lib/flags";
import {
  hashContenidoEconomico,
  motivoRevisionPendiente,
  type RevisionPendiente,
} from "@/lib/revision-independiente";

export const ITEMS_LIBERACION_DEFAULT: Omit<ChecklistLiberacionItem, "checked">[] = [
  { id: "documentos_descargados", label: "Se descargaron todos los documentos de la fuente" },
  { id: "convocatoria_revisada", label: "Se revisó Convocatoria/Invitación completa" },
  { id: "anexo_tecnico_revisado", label: "Se revisó íntegramente el Anexo Técnico" },
  { id: "terminos_condiciones_revisados", label: "Se revisaron Términos y Condiciones" },
  { id: "formatos_revisados", label: "Se revisaron todos los formatos obligatorios" },
  { id: "aclaraciones_incorporadas", label: "Se incorporaron las aclaraciones a la matriz de requisitos" },
  { id: "legal_administrativo_integrado", label: "Se integró la documentación legal-administrativa" },
  { id: "tecnico_acreditado", label: "Se acreditó cada requisito técnico con evidencia" },
  { id: "economica_integrada", label: "Se integró la propuesta económica" },
  { id: "textos_obligatorios", label: "Los textos y manifestaciones obligatorias están incluidos" },
  { id: "firmas_completas", label: "Los documentos que requieren firma están firmados" },
  { id: "archivos_legibles", label: "Los archivos finales son legibles" },
  { id: "revision_independiente", label: "Se realizó una revisión independiente (doble check)" },
  { id: "compras_mx_capturado", label: "Se capturó correctamente la información en Compras MX" },
  { id: "version_respaldada", label: "Se respaldó exactamente la versión que se enviará" },
] as const;

/**
 * Checklist final de liberación completo (§29 del proceso operativo), en
 * orden de proceso. Contiene los 15 puntos base —mismos ids, así que las
 * marcas existentes se conservan— más los 11 que faltaban. Se usa solo con
 * el flag `gate.liberacion_ampliada`: activarlo agrega puntos sin marcar a
 * las licitaciones en curso. Quedan fuera "firma/envío electrónico" y
 * "se obtuvo acuse": ocurren después de enviar y viven en la evidencia de
 * envío, no en la compuerta previa.
 */
export const ITEMS_LIBERACION_AMPLIADO: Omit<ChecklistLiberacionItem, "checked">[] = [
  { id: "documentos_descargados", label: "Se descargaron todos los documentos de la fuente" },
  { id: "convocatoria_revisada", label: "Se revisó Convocatoria/Invitación completa" },
  { id: "anexo_tecnico_revisado", label: "Se revisó íntegramente el Anexo Técnico" },
  { id: "terminos_condiciones_revisados", label: "Se revisaron Términos y Condiciones" },
  { id: "formatos_revisados", label: "Se revisaron todos los formatos obligatorios" },
  { id: "aclaraciones_incorporadas", label: "Se revisaron las aclaraciones y se incorporaron a la matriz de requisitos" },
  { id: "requisitos_modificados_actualizados", label: "Se actualizaron los requisitos que fueron modificados" },
  { id: "compras_mx_requisitos_revisados", label: "Se recorrieron las pantallas de Compras MX y se revisaron los requisitos visibles ahí (Paso 13)" },
  { id: "legal_administrativo_integrado", label: "Se integró la documentación legal-administrativa" },
  { id: "tecnico_acreditado", label: "Se acreditó cada requisito técnico con evidencia" },
  { id: "economica_integrada", label: "Se integró la propuesta económica" },
  { id: "conciliacion_cantidades_unidades", label: "Cantidades y unidades coinciden entre Anexo Técnico, formato económico, hoja de costos y Compras MX" },
  { id: "conciliacion_precios_subtotales", label: "Precios unitarios y subtotales coinciden en los cuatro niveles" },
  { id: "conciliacion_iva_total", label: "IVA y total coinciden en los cuatro niveles" },
  { id: "vigencias_coinciden", label: "Las vigencias coinciden entre documentos y con lo solicitado" },
  { id: "razon_social_rfc_coinciden", label: "Razón social y RFC coinciden en todos los documentos" },
  { id: "numero_procedimiento_coincide", label: "El número de procedimiento coincide en todos los documentos" },
  { id: "textos_obligatorios", label: "Los textos y manifestaciones obligatorias están incluidos" },
  { id: "firmas_completas", label: "Los documentos que requieren firma están firmados" },
  { id: "archivos_legibles", label: "Los archivos finales son legibles" },
  { id: "nombres_versiones_archivos", label: "Se revisaron los nombres y versiones de los archivos" },
  { id: "revision_independiente", label: "Se realizó una revisión independiente (doble check)" },
  { id: "compras_mx_capturado", label: "Se capturó correctamente la información en Compras MX" },
  { id: "compras_mx_economico_capturado", label: "Se capturó correctamente la información económica en Compras MX" },
  { id: "archivos_cargados_revisados", label: "Se revisaron todos los archivos cargados en Compras MX" },
  { id: "version_respaldada", label: "Se respaldó exactamente la versión que se enviará" },
];

// Paso 24: la Investigación de Mercado usa un checklist de intake propio,
// más ligero que el checklist de liberación de una licitación formal.
export const ITEMS_INVESTIGACION_MERCADO: Omit<ChecklistLiberacionItem, "checked">[] = [
  { id: "im_solicitud_registrada", label: "Se registró la solicitud" },
  { id: "im_solicitud_descargada", label: "Se descargó la solicitud y sus anexos" },
  { id: "im_fecha_limite", label: "Se identificó la fecha límite" },
  { id: "im_especificaciones", label: "Se analizaron las especificaciones" },
  { id: "im_capacidad", label: "Se confirmó la capacidad de suministro/prestación" },
  { id: "im_cantidades", label: "Se identificaron cantidades y unidades" },
  { id: "im_condiciones", label: "Se determinaron las condiciones comerciales" },
  { id: "im_aclaraciones", label: "Se solicitaron aclaraciones, si fueron necesarias" },
  { id: "im_cotizacion", label: "Se preparó la cotización conforme al formato solicitado" },
  { id: "im_textos", label: "Se incorporaron los textos y manifestaciones exigidos" },
  { id: "im_documentacion", label: "Se incorporó la documentación solicitada" },
  { id: "im_plataforma", label: "Se capturó la información requerida en plataforma, si aplica" },
  { id: "im_conciliacion", label: "Se concilió cantidades y precios" },
  { id: "im_enviada", label: "Se envió la cotización" },
  { id: "im_evidencia", label: "Se conservó evidencia del envío" },
  { id: "im_antecedente", label: "Se registró la cotización como antecedente comercial" },
];

export function buildItemsLiberacion(
  existentes: ChecklistLiberacionItem[] = [],
  esInvestigacionMercado = false,
  ampliado = false,
): ChecklistLiberacionItem[] {
  const plantilla = esInvestigacionMercado
    ? ITEMS_INVESTIGACION_MERCADO
    : ampliado
      ? ITEMS_LIBERACION_AMPLIADO
      : ITEMS_LIBERACION_DEFAULT;
  const previos = new Map(existentes.map((i) => [i.id, i.checked]));
  return plantilla.map((def) => ({
    ...def,
    checked: previos.get(def.id) ?? false,
  }));
}

export interface AnalisisIaPendiente {
  id: string;
  tipo_analisis: string;
  documento_id: string | null;
  created_at: string;
}

export interface GateStatus {
  rojos: number;
  amarillosCriticos: number;
  pendientesLiberacion: number;
  itemsLiberacion: ChecklistLiberacionItem[];
  jerarquiaAutorizada: boolean;
  /** B5 (D5) — versiones activas de `ai_results` que siguen en PENDIENTE. */
  analisisIaSinRevisar: AnalisisIaPendiente[];
  /** true si el flag `ai.gate_aprobacion` está activo para la organización;
   * solo entonces `analisisIaSinRevisar` cuenta para `bloqueado`. */
  gateAprobacionIaActivo: boolean;
  /** Paso 17 — con el flag `gate.revisor_independiente` activo, las
   * propuestas sin revisión vigente bloquean el envío. */
  revisionIndependiente: { activo: boolean; pendientes: RevisionPendiente[] };
  bloqueado: boolean;
}

/** ¿El flag de checklist ampliado (Paso 29) está activo para la organización? */
export async function liberacionAmpliadaActiva(
  supabase: SupabaseClient,
  organizationId?: string,
): Promise<boolean> {
  return organizationId
    ? isEnabled(supabase, "gate.liberacion_ampliada", { organizationId })
    : false;
}

async function revisionesPendientes(
  supabase: SupabaseClient,
  licitacionId: string,
): Promise<RevisionPendiente[]> {
  const [{ data: tecnica }, { data: partidas }, { data: config }, { data: revEco }] =
    await Promise.all([
      supabase
        .from("propuestas")
        .select("created_by, revisor_id, revisado_at")
        .eq("licitacion_id", licitacionId)
        .eq("tipo", "TECNICA")
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("propuesta_economica_partidas")
        .select("descripcion, cantidad, unidad, precio_unitario_ofertado, subtotal, iva, total")
        .eq("licitacion_id", licitacionId),
      supabase
        .from("propuesta_economica_config")
        .select("tipo_precio, incluye_iva, moneda, condiciones_pago, tiempo_entrega_dias, validez_oferta_dias")
        .eq("licitacion_id", licitacionId)
        .maybeSingle(),
      supabase
        .from("revisiones_independientes")
        .select("elaborado_por, revisor_id, revisado_at, contenido_hash")
        .eq("licitacion_id", licitacionId)
        .eq("ambito", "ECONOMICA")
        .maybeSingle(),
    ]);

  const pendientes: RevisionPendiente[] = [];

  // Solo se exige revisión de lo que existe: si no hay propuesta generada o
  // capturada, lo cubre el checklist de liberación, no este control.
  if (tecnica) {
    const motivo = motivoRevisionPendiente({
      elaboradoPor: tecnica.created_by,
      revisorId: tecnica.revisor_id,
      revisadoAt: tecnica.revisado_at,
    });
    if (motivo) pendientes.push({ ambito: "TECNICA", motivo });
  }

  if ((partidas ?? []).length > 0) {
    const motivo = motivoRevisionPendiente({
      elaboradoPor: revEco?.elaborado_por ?? null,
      revisorId: revEco?.revisor_id ?? null,
      revisadoAt: revEco?.revisado_at ?? null,
      hashRevisado: revEco?.contenido_hash ?? null,
      hashActual: hashContenidoEconomico(partidas ?? [], config ?? null),
    });
    if (motivo) pendientes.push({ ambito: "ECONOMICA", motivo });
  }

  return pendientes;
}

/**
 * Regla del proceso operativo (Paso 25 y 29): un procedimiento no puede
 * marcarse como enviado si tiene requisitos en rojo, requisitos críticos en
 * amarillo, puntos del checklist final de liberación sin confirmar, o si el
 * Supervisor asignado no ha dado su autorización final.
 */
export async function getGateStatus(
  supabase: SupabaseClient,
  licitacionId: string,
  organizationId?: string,
): Promise<GateStatus> {
  const [
    { data: checklist },
    { data: liberacion },
    { data: licitacion },
    { data: jerarquia },
    { data: analisisPendientes },
    gateAprobacionIaActivo,
    ampliado,
    revisionActiva,
  ] = await Promise.all([
    supabase.from("checklist_items").select("estado, critico").eq("licitacion_id", licitacionId),
    supabase
      .from("checklist_liberacion")
      .select("items_json")
      .eq("licitacion_id", licitacionId)
      .maybeSingle(),
    supabase
      .from("licitaciones")
      .select("es_investigacion_mercado")
      .eq("id", licitacionId)
      .maybeSingle(),
    supabase
      .from("licitacion_jerarquia")
      .select("supervisor_autorizado_at")
      .eq("licitacion_id", licitacionId)
      .maybeSingle(),
    supabase.rpc("licitacion_analisis_ia_pendientes", { p_licitacion_id: licitacionId }),
    organizationId
      ? isEnabled(supabase, "ai.gate_aprobacion", { organizationId })
      : Promise.resolve(false),
    liberacionAmpliadaActiva(supabase, organizationId),
    organizationId
      ? isEnabled(supabase, "gate.revisor_independiente", { organizationId })
      : Promise.resolve(false),
  ]);

  const revisionPendientes = revisionActiva ? await revisionesPendientes(supabase, licitacionId) : [];

  const items = checklist ?? [];
  const rojos = items.filter((i) => i.estado === "ROJO").length;
  const amarillosCriticos = items.filter((i) => i.estado === "AMARILLO" && i.critico).length;

  const itemsLiberacion = buildItemsLiberacion(
    (liberacion?.items_json as ChecklistLiberacionItem[]) ?? [],
    licitacion?.es_investigacion_mercado ?? false,
    ampliado,
  );
  const pendientesLiberacion = itemsLiberacion.filter((i) => !i.checked).length;
  const jerarquiaAutorizada = !!jerarquia?.supervisor_autorizado_at;
  const analisisIaSinRevisar = (analisisPendientes ?? []) as AnalisisIaPendiente[];

  return {
    rojos,
    amarillosCriticos,
    pendientesLiberacion,
    itemsLiberacion,
    jerarquiaAutorizada,
    analisisIaSinRevisar,
    gateAprobacionIaActivo,
    revisionIndependiente: { activo: revisionActiva, pendientes: revisionPendientes },
    bloqueado:
      rojos > 0 ||
      amarillosCriticos > 0 ||
      pendientesLiberacion > 0 ||
      !jerarquiaAutorizada ||
      (gateAprobacionIaActivo && analisisIaSinRevisar.length > 0) ||
      (revisionActiva && revisionPendientes.length > 0),
  };
}
