import type {
  AdjuntoCorreo,
  CorreoDetalle,
  CorreoResumen,
  EstadoCorreo,
  LicitacionDeCorreo,
} from "@/lib/correos-compras-mx";

// Lo que se pide a PostgREST para pintar un correo, con sus dos licitaciones
// (la asociada y la sugerida) por nombre de llave foránea: hay dos hacia la
// misma tabla y sin el nombre PostgREST no sabe cuál usar.
const LIC = "id, numero_expediente, titulo";
export const SELECT_RESUMEN = `id, de, asunto, recibido_en, estado, remitente_reconocido, adjuntos,
  licitacion:licitaciones!correos_compras_mx_licitacion_id_fkey(${LIC}),
  sugerencia:licitaciones!correos_compras_mx_sugerencia_licitacion_id_fkey(${LIC})`;
export const SELECT_DETALLE = `${SELECT_RESUMEN}, para, cuerpo_texto`;

export interface FilaCorreoConJoins {
  id: string;
  de: string;
  asunto: string;
  recibido_en: string;
  estado: string;
  remitente_reconocido: boolean;
  adjuntos: unknown;
  licitacion: LicitacionDeCorreo | null;
  sugerencia: LicitacionDeCorreo | null;
  para?: string[];
  cuerpo_texto?: string;
}

export function aResumen(f: FilaCorreoConJoins): CorreoResumen {
  return {
    id: f.id,
    de: f.de,
    asunto: f.asunto,
    recibido_en: f.recibido_en,
    estado: f.estado as EstadoCorreo,
    remitente_reconocido: f.remitente_reconocido,
    adjuntos: Array.isArray(f.adjuntos) ? (f.adjuntos as AdjuntoCorreo[]) : [],
    licitacion: f.licitacion,
    sugerencia: f.sugerencia,
  };
}

export function aDetalle(f: FilaCorreoConJoins): CorreoDetalle {
  return { ...aResumen(f), para: f.para ?? [], cuerpo_texto: f.cuerpo_texto ?? "" };
}
