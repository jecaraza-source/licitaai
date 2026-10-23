// Proceso operativo de Compras MX — constantes compartidas entre la UI y la
// API para los Pasos 1–3 (registro, expediente y calendario).

/** Paso 2 — carpeta controlada del expediente (valores = check de documentos.carpeta). */
export const CARPETAS_EXPEDIENTE = [
  { value: "01_CONVOCATORIA", label: "01 · Convocatoria / Invitación" },
  { value: "02_ANEXO_TECNICO", label: "02 · Anexo Técnico" },
  { value: "03_FORMATOS", label: "03 · Formatos" },
  { value: "04_ACLARACIONES", label: "04 · Aclaraciones" },
  { value: "05_LEGAL_ADMINISTRATIVO", label: "05 · Legal-administrativo" },
  { value: "06_PROPUESTA_TECNICA", label: "06 · Propuesta técnica" },
  { value: "07_PROPUESTA_ECONOMICA", label: "07 · Propuesta económica" },
  { value: "08_COMPRASMX", label: "08 · Compras MX" },
  { value: "09_PROPUESTA_FINAL", label: "09 · Propuesta final" },
  { value: "10_ACUSES_EVIDENCIAS", label: "10 · Acuses y evidencias" },
  { value: "11_FALLO_CONTRATO", label: "11 · Fallo y contrato" },
] as const;

export type CarpetaExpediente = (typeof CARPETAS_EXPEDIENTE)[number]["value"];
export const CARPETA_VALUES = CARPETAS_EXPEDIENTE.map((c) => c.value) as [
  CarpetaExpediente,
  ...CarpetaExpediente[],
];

/**
 * Paso 3 — eventos críticos con fecha en `licitaciones` y la acción interna
 * sugerida por el proceso. La acción editable se guarda en
 * `licitaciones.acciones_internas[campo]`.
 */
export const EVENTOS_CRITICOS = [
  { campo: "fecha_publicacion", evento: "Publicación / recepción", accionSugerida: "Apertura de expediente" },
  { campo: "fecha_limite_preguntas", evento: "Límite de preguntas", accionSugerida: "Cerrar preguntas previamente" },
  { campo: "fecha_junta_aclaraciones", evento: "Junta de aclaraciones", accionSugerida: "Revisar resultado" },
  { campo: "fecha_visita", evento: "Visita a instalaciones", accionSugerida: "Confirmar asistencia" },
  { campo: "fecha_entrega_muestras", evento: "Entrega de muestras", accionSugerida: "Preparar" },
  { campo: "fecha_entrega_propuesta", evento: "Presentación de propuesta", accionSugerida: "Cierre interno anticipado" },
  { campo: "fecha_apertura_tecnica", evento: "Apertura técnica", accionSugerida: "Seguimiento" },
  { campo: "fecha_apertura_economica", evento: "Apertura económica", accionSugerida: "Seguimiento" },
  { campo: "fecha_fallo", evento: "Fallo", accionSugerida: "Seguimiento" },
  { campo: "fecha_firma_contrato", evento: "Firma de contrato", accionSugerida: "Preparar documentación" },
  { campo: "fecha_garantia", evento: "Garantía", accionSugerida: "Tramitar" },
] as const;

export type CampoEvento = (typeof EVENTOS_CRITICOS)[number]["campo"];
export const CAMPOS_EVENTO = EVENTOS_CRITICOS.map((e) => e.campo) as [CampoEvento, ...CampoEvento[]];

/**
 * Eventos cuya fecha se captura/edita desde la tarjeta de calendario. Las 7
 * fechas originales se capturan al crear la licitación (no hay pantalla que
 * las edite después), así que aquí solo se editan las 4 que se agregaron.
 */
export const CAMPOS_EVENTO_EDITABLES = [
  "fecha_limite_preguntas",
  "fecha_entrega_muestras",
  "fecha_firma_contrato",
  "fecha_garantia",
] as const satisfies readonly CampoEvento[];

export type CampoEventoEditable = (typeof CAMPOS_EVENTO_EDITABLES)[number];

/**
 * Regla operativa del Paso 1: la fecha límite oficial es absoluta, así que el
 * cierre interno debe ser estrictamente anterior. Devuelve un mensaje de error
 * o null si es válido (o si falta alguna de las dos fechas).
 */
export function validarCierreInterno(
  cierreInterno: string | null | undefined,
  entregaPropuesta: string | null | undefined,
): string | null {
  if (!cierreInterno || !entregaPropuesta) return null;
  const cierre = Date.parse(cierreInterno);
  const limite = Date.parse(entregaPropuesta);
  if (Number.isNaN(cierre) || Number.isNaN(limite)) return null;
  return cierre < limite
    ? null
    : "El cierre interno debe ser anterior a la fecha límite de presentación de propuesta";
}
