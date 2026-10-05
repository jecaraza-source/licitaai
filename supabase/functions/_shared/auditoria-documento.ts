// Lógica pura de auditar-documento: qué contexto se le da al modelo y cómo
// se traduce su veredicto al semáforo del checklist. Vive aparte de la Edge
// Function para poder probarla sin Deno ni llamadas a IA.

export type EstadoChecklist = "VERDE" | "AMARILLO" | "ROJO" | "GRIS";

/**
 * Traduce el veredicto del modelo al estado del renglón del checklist.
 *
 * - GRIS ("No aplica") es una decisión explícita de una persona: la
 *   auditoría nunca la pisa (devuelve null = no tocar el estado).
 * - Manda `nivel_riesgo`: ROJO → ROJO, AMARILLO → AMARILLO. Antes solo se
 *   miraba `valido`, así que un riesgo AMARILLO nunca llegaba al semáforo
 *   y cualquier `valido: false` bloqueaba la liberación como ROJO.
 * - `valido: true` con riesgo VERDE es lo único que cuenta como VERDE;
 *   `valido: false` con riesgo VERDE es una contradicción del modelo y se
 *   deja AMARILLO para que lo revise una persona, no ROJO.
 */
export function estadoDesdeAuditoria(
  valido: boolean,
  nivelRiesgo: string | null | undefined,
  estadoActual: string | null | undefined,
): EstadoChecklist | null {
  if (estadoActual === "GRIS") return null;
  if (nivelRiesgo === "ROJO") return "ROJO";
  if (nivelRiesgo === "AMARILLO") return "AMARILLO";
  return valido ? "VERDE" : "AMARILLO";
}

export interface ContextoAuditoria {
  requisito: {
    descripcion: string;
    categoria: string;
    fundamento_legal: string | null;
    vigencia_requerida: string | null;
  } | null;
  fechaEntregaPropuesta: string | null;
  empresa: {
    razon_social?: string | null;
    rfc?: string | null;
    representante_legal_nombre?: string | null;
  } | null;
}

/** Texto de usuario que acompaña al documento en la llamada al modelo. */
export function construirContextoAuditoria(c: ContextoAuditoria): string {
  const nd = (v: string | null | undefined) => (v && v.trim() ? v : "N/D");
  return `
Requisito esperado: ${c.requisito?.descripcion ?? "Documento general"} (categoría: ${nd(c.requisito?.categoria)})
Fundamento legal: ${nd(c.requisito?.fundamento_legal)}
Vigencia requerida: ${nd(c.requisito?.vigencia_requerida)}
Fecha de entrega de propuesta (para validar vigencia): ${nd(c.fechaEntregaPropuesta)}

Datos de referencia de la empresa participante. Compáralos SOLO con los datos de la
persona o entidad a cuyo nombre está emitido el documento (ver reglas del sistema):
Razón social: ${nd(c.empresa?.razon_social)}
RFC: ${nd(c.empresa?.rfc)}
Representante legal registrado: ${nd(c.empresa?.representante_legal_nombre)}
`.trim();
}

/** Reglas de comparación que se añaden al prompt de sistema. */
export const REGLAS_COMPARACION = `
Reglas para comparar contra los datos de referencia:
- Compara únicamente los datos de la persona o entidad a cuyo nombre se emite el documento.
  El RFC, razón social, domicilio o firma de terceros que solo aparecen como emisor o
  intermediario (CFE, Telmex, SAT, bancos, notarios, fabricantes, proveedores) NO son
  discrepancias: ignóralos. Por ejemplo, un comprobante de domicilio trae el RFC de la
  compañía que lo emite, no el de la empresa participante.
- Si el documento es de una persona física (identificación oficial, poder, escrito de
  personalidad), compara su nombre contra el representante legal registrado, nunca contra el
  RFC o la razón social de la empresa.
- Si falta el dato de referencia para comparar, o el documento no lo trae, repórtalo como
  observación ("no verificable"); no lo marques como inválido por eso.
- Usa valido: false solo cuando haya un incumplimiento real del requisito. Gradúa
  nivel_riesgo: ROJO si incumple o es inválido, AMARILLO si hay dudas o datos no verificables,
  VERDE si cumple.
`.trim();
