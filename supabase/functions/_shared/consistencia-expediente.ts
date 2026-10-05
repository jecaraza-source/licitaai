// Paso 15 del proceso operativo de Compras MX — control de consistencia
// documental. "El mismo dato no debe aparecer de forma distinta entre
// documentos": razón social, RFC y número de procedimiento se comparan aquí
// de forma determinista (sin IA), a partir de lo que `auditar-documento`
// extrajo de cada archivo. La IA de `auditar-expediente` solo redacta el
// resumen y revisa lo que no es comparable por regla (vigencias, montos…).
//
// Pura y sin imports: la usan la Edge Function (Deno) y los tests (tsx).

export type CampoConsistencia = "RFC" | "Razón social" | "Número de procedimiento";

export interface HallazgoConsistencia {
  campo: CampoConsistencia;
  severidad: "inconsistencia" | "advertencia";
  detalle: string;
  documentos: string[];
  origen: "determinista";
}

export interface CamposDocumento {
  rfc?: string | null;
  razon_social?: string | null;
  numero_procedimiento?: string | null;
}

export interface DocumentoParaComparar {
  nombre: string;
  /** `campos_detectados` de la auditoría del documento. */
  campos: CamposDocumento | null;
}

export interface ReferenciaExpediente {
  rfc?: string | null;
  razon_social?: string | null;
  /** `licitaciones.numero_expediente`. No es fuente de verdad: puede ser un
   * folio interno distinto del número de procedimiento oficial. */
  numero_procedimiento?: string | null;
}

/**
 * Las auditorías anteriores a esta versión guardaron en `rfc`/`razon_social`
 * lo primero que vieron en el documento (p. ej. el RFC de CFE en un recibo),
 * no el del participante. Solo se comparan las que traen la clave
 * `numero_procedimiento`, que marca el esquema nuevo: ahí `rfc` y
 * `razon_social` son del participante o null.
 */
export function tieneEsquemaVigente(campos: unknown): campos is CamposDocumento {
  return !!campos && typeof campos === "object" && "numero_procedimiento" in (campos as object);
}

export function normalizarRfc(v: string | null | undefined): string {
  return (v ?? "").toUpperCase().replace(/[^A-Z0-9&Ñ]/g, "");
}

export function normalizarProcedimiento(v: string | null | undefined): string {
  return (v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

const SUFIJO_SOCIETARIO =
  /\b(?:S ?A ?P ?I|S ?A ?B|S ?A ?S|S ?DE ?R ?L|S ?A|S ?C|A ?C)(?: ?DE ?C ?V)?$/;

/** Mayúsculas, sin acentos ni puntuación y sin el régimen societario final
 * ("S.A. DE C.V.", "SA DE CV", "S. de R.L. de C.V."…). */
export function normalizarRazonSocial(v: string | null | undefined): string {
  const limpio = (v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9&]+/g, " ")
    .trim();
  return limpio.replace(SUFIJO_SOCIETARIO, "").trim();
}

function unoContieneAlOtro(a: string, b: string): boolean {
  return a !== "" && b !== "" && (a.includes(b) || b.includes(a));
}

interface Valor {
  documento: string;
  crudo: string;
  norm: string;
}

function recolectar(
  docs: DocumentoParaComparar[],
  campo: keyof CamposDocumento,
  normalizar: (v: string | null | undefined) => string,
): Valor[] {
  const valores: Valor[] = [];
  for (const d of docs) {
    if (!tieneEsquemaVigente(d.campos)) continue;
    const crudo = d.campos[campo];
    const norm = normalizar(crudo);
    if (crudo && norm) valores.push({ documento: d.nombre, crudo: crudo.trim(), norm });
  }
  return valores;
}

function describir(valores: Valor[]): string {
  return valores.map((v) => `${v.documento}: "${v.crudo}"`).join("; ");
}

function distintosEntreSi(valores: Valor[]): Valor[][] {
  const grupos = new Map<string, Valor[]>();
  for (const v of valores) grupos.set(v.norm, [...(grupos.get(v.norm) ?? []), v]);
  return [...grupos.values()];
}

function compararCampo(
  campo: CampoConsistencia,
  referencia: string | null | undefined,
  valores: Valor[],
  normalizar: (v: string | null | undefined) => string,
  opts: { autoritativa: boolean; toleraVariantes: boolean },
): HallazgoConsistencia[] {
  if (valores.length === 0) return [];
  const hallazgos: HallazgoConsistencia[] = [];
  const refNorm = normalizar(referencia);

  // 1) Entre documentos: dos valores distintos del mismo dato es siempre un
  //    problema, haya o no referencia.
  const grupos = distintosEntreSi(valores);
  if (grupos.length > 1) {
    const soloVariantes =
      opts.toleraVariantes &&
      grupos.every((g, i) => grupos.every((h, j) => i === j || unoContieneAlOtro(g[0].norm, h[0].norm)));
    hallazgos.push({
      campo,
      severidad: soloVariantes ? "advertencia" : "inconsistencia",
      detalle: `${campo} distinto entre documentos — ${describir(valores)}.`,
      documentos: valores.map((v) => v.documento),
      origen: "determinista",
    });
    return hallazgos;
  }

  // 2) Todos coinciden entre sí: se contrasta con la referencia.
  if (!refNorm) return hallazgos;
  const valor = valores[0];
  if (valor.norm === refNorm) return hallazgos;

  const esVariante = opts.toleraVariantes && unoContieneAlOtro(valor.norm, refNorm);
  const severidad: HallazgoConsistencia["severidad"] =
    !opts.autoritativa || esVariante ? "advertencia" : "inconsistencia";
  const origen = opts.autoritativa
    ? `el dato registrado ("${referencia?.trim()}")`
    : `el registrado en la licitación ("${referencia?.trim()}"), que puede ser un folio interno`;
  hallazgos.push({
    campo,
    severidad,
    detalle:
      `${campo}: los documentos coinciden entre sí pero no con ${origen} — ${describir(valores)}.`,
    documentos: valores.map((v) => v.documento),
    origen: "determinista",
  });
  return hallazgos;
}

export function compararConsistencia(
  referencia: ReferenciaExpediente,
  documentos: DocumentoParaComparar[],
): HallazgoConsistencia[] {
  return [
    ...compararCampo("RFC", referencia.rfc, recolectar(documentos, "rfc", normalizarRfc), normalizarRfc, {
      autoritativa: true,
      toleraVariantes: false,
    }),
    ...compararCampo(
      "Razón social",
      referencia.razon_social,
      recolectar(documentos, "razon_social", normalizarRazonSocial),
      normalizarRazonSocial,
      { autoritativa: true, toleraVariantes: true },
    ),
    ...compararCampo(
      "Número de procedimiento",
      referencia.numero_procedimiento,
      recolectar(documentos, "numero_procedimiento", normalizarProcedimiento),
      normalizarProcedimiento,
      { autoritativa: false, toleraVariantes: false },
    ),
  ];
}

/** Cuántos documentos entraron a la comparación (esquema vigente). */
export function documentosComparables(documentos: DocumentoParaComparar[]): number {
  return documentos.filter((d) => tieneEsquemaVigente(d.campos)).length;
}
