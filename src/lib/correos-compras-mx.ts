// Lógica pura de la bandeja de correos de Compras MX: a qué empresa
// pertenece un correo entrante (por la dirección a la que llegó), cómo se
// reduce a texto plano, de qué remitente viene y qué licitación sugiere su
// contenido. Sin React ni Supabase, para poder probarla sin navegador.

/** Parte local de una dirección, con o sin nombre: "Ana <Ana+x@Dom.com>" → "ana". */
function parteLocal(direccion: string): { local: string; dominio: string } | null {
  const m = direccion.match(/<([^>]+)>/);
  const limpia = (m ? m[1] : direccion).trim().toLowerCase();
  const arroba = limpia.lastIndexOf("@");
  if (arroba <= 0) return null;
  const local = limpia.slice(0, arroba).split("+")[0];
  const dominio = limpia.slice(arroba + 1);
  return local && dominio ? { local, dominio } : null;
}

/**
 * Alias de empresa al que se dirigió un correo: la parte local del primer
 * destinatario cuyo dominio sea el subdominio de entrada. Ignora el `+etiqueta`
 * y las mayúsculas. null si ningún destinatario es de ese dominio.
 */
export function extraerAlias(destinatarios: readonly string[], dominioEntrada: string): string | null {
  const dominio = dominioEntrada.trim().toLowerCase();
  if (!dominio) return null;
  for (const d of destinatarios) {
    const p = parteLocal(d);
    if (p && p.dominio === dominio) return p.local;
  }
  return null;
}

/** Dirección de entrada completa de una empresa. */
export function direccionDeEntrada(alias: string, dominioEntrada: string): string {
  return `${alias}@${dominioEntrada.trim().toLowerCase()}`;
}

/** ¿El remitente es un dominio gubernamental mexicano (`*.gob.mx`)? */
export function esRemitenteGubernamental(de: string): boolean {
  const p = parteLocal(de);
  return !!p && (p.dominio === "gob.mx" || p.dominio.endsWith(".gob.mx"));
}

const ENTIDADES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&aacute;": "á",
  "&eacute;": "é",
  "&iacute;": "í",
  "&oacute;": "ó",
  "&uacute;": "ú",
  "&ntilde;": "ñ",
};

export const MAX_CUERPO = 100_000;

/**
 * Cuerpo del correo como texto plano. Se prefiere la parte de texto; si no
 * hay, se quitan las etiquetas del HTML (incluidos script y style). El HTML
 * original nunca se guarda ni se muestra.
 */
export function textoPlano(html: string | null | undefined, texto: string | null | undefined): string {
  let t = texto?.trim() ? texto : "";
  if (!t && html) {
    t = html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>|<\/(p|div|tr|li|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&(?:nbsp|amp|lt|gt|quot|#39|aacute|eacute|iacute|oacute|uacute|ntilde);/g, (e) => ENTIDADES[e] ?? e);
  }
  return t
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_CUERPO);
}

const soloAlfanumerico = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

/**
 * Licitación que menciona un correo: la única cuyo número de expediente
 * aparece en el asunto o en el cuerpo (sin distinguir mayúsculas, espacios ni
 * guiones). Con cero o con varias coincidencias no se sugiere nada: el usuario
 * decide. Expedientes de menos de 8 caracteres no se buscan, para no sugerir
 * por coincidencias casuales.
 */
export function sugerirLicitacion(
  asunto: string,
  cuerpo: string,
  licitaciones: readonly { id: string; numero_expediente: string }[],
): string | null {
  const pajar = soloAlfanumerico(`${asunto}\n${cuerpo}`);
  const coincidencias = new Set<string>();
  for (const l of licitaciones) {
    const clave = soloAlfanumerico(l.numero_expediente);
    if (clave.length >= 8 && pajar.includes(clave)) coincidencias.add(l.id);
  }
  return coincidencias.size === 1 ? [...coincidencias][0] : null;
}

export interface AdjuntoCorreo {
  nombre: string;
  tipo: string;
  tamano: number;
}

/** Metadatos de adjuntos (los archivos no se guardan). */
export function resumirAdjuntos(
  adjuntos: readonly { filename?: string | null; content_type?: string | null; size?: number | null }[] | null | undefined,
): AdjuntoCorreo[] {
  return (adjuntos ?? []).map((a) => ({
    nombre: a.filename?.trim() || "sin nombre",
    tipo: a.content_type || "application/octet-stream",
    tamano: typeof a.size === "number" && a.size >= 0 ? a.size : 0,
  }));
}

// --- Tipos que comparten la API y la pantalla ---

export const ESTADOS_CORREO = ["PENDIENTE", "ASOCIADO", "DESCARTADO"] as const;
export type EstadoCorreo = (typeof ESTADOS_CORREO)[number];

export const ETIQUETAS_ESTADO_CORREO: Record<EstadoCorreo, string> = {
  PENDIENTE: "Por revisar",
  ASOCIADO: "Asociados",
  DESCARTADO: "Descartados",
};

export interface LicitacionDeCorreo {
  id: string;
  numero_expediente: string;
  titulo: string;
}

export interface CorreoResumen {
  id: string;
  de: string;
  asunto: string;
  recibido_en: string;
  estado: EstadoCorreo;
  remitente_reconocido: boolean;
  adjuntos: AdjuntoCorreo[];
  licitacion: LicitacionDeCorreo | null;
  sugerencia: LicitacionDeCorreo | null;
}

export interface CorreoDetalle extends CorreoResumen {
  para: string[];
  cuerpo_texto: string;
}

export interface BandejaCorreos {
  items: CorreoResumen[];
  total: number;
  conteos: Record<EstadoCorreo, number>;
  /** Dirección de entrada de la empresa; null si la recepción aún no está activada. */
  direccion: string | null;
}
