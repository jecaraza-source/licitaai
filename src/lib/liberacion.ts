import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChecklistLiberacionItem } from "@/types";
import { isEnabled } from "@/lib/flags";

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
): ChecklistLiberacionItem[] {
  const plantilla = esInvestigacionMercado ? ITEMS_INVESTIGACION_MERCADO : ITEMS_LIBERACION_DEFAULT;
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
  bloqueado: boolean;
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
  ]);

  const items = checklist ?? [];
  const rojos = items.filter((i) => i.estado === "ROJO").length;
  const amarillosCriticos = items.filter((i) => i.estado === "AMARILLO" && i.critico).length;

  const itemsLiberacion = buildItemsLiberacion(
    (liberacion?.items_json as ChecklistLiberacionItem[]) ?? [],
    licitacion?.es_investigacion_mercado ?? false,
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
    bloqueado:
      rojos > 0 ||
      amarillosCriticos > 0 ||
      pendientesLiberacion > 0 ||
      !jerarquiaAutorizada ||
      (gateAprobacionIaActivo && analisisIaSinRevisar.length > 0),
  };
}
