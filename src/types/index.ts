export type Rol = "ADMIN" | "MANAGER" | "ANALYST" | "VIEWER";

export type EstadoLicitacion =
  | "NUEVA"
  | "ANALISIS"
  | "PREPARACION"
  | "ENVIADA"
  | "SEGUIMIENTO"
  | "CERRADA";

export type TipoLicitacion = "ADQUISICION" | "SERVICIOS" | "OBRA_PUBLICA";

export type EstadoId = "FEDERAL" | "EDOMEX" | "CDMX";

export type Sistema = "COMPRANET" | "EDCA" | "SCA";

export type NivelConfianza = "ALTO" | "MEDIO" | "BAJO";

export interface Organization {
  id: string;
  nombre: string;
  rfc: string | null;
  created_at: string;
}

export interface Usuario {
  id: string;
  organization_id: string;
  email: string;
  nombre: string;
  rol: Rol;
  created_at: string;
}

export interface Licitacion {
  id: string;
  organization_id: string;
  numero_expediente: string;
  titulo: string;
  institucion: string;
  estado_licitacion: EstadoLicitacion;
  tipo: TipoLicitacion;
  monto_maximo: number | null;
  fecha_publicacion: string | null;
  fecha_junta_aclaraciones: string | null;
  fecha_visita: string | null;
  fecha_entrega_propuesta: string | null;
  fecha_apertura_tecnica: string | null;
  fecha_apertura_economica: string | null;
  fecha_fallo: string | null;
  estado_id: EstadoId;
  sistema: Sistema;
  created_by: string | null;
  created_at: string;
}

export interface Documento {
  id: string;
  licitacion_id: string;
  tipo_documento: string;
  nombre: string;
  storage_path: string;
  tamanio_bytes: number | null;
  procesado: boolean;
  procesado_at: string | null;
  created_at: string;
}

export interface Partida {
  id: string;
  licitacion_id: string;
  numero: string;
  descripcion: string;
  unidad: string | null;
  cantidad: number | null;
  precio_unitario_referencia: number | null;
}

export type TipoPropuesta = "TECNICA" | "ECONOMICA";
export type EstadoPropuesta = "BORRADOR" | "EN_REVISION" | "APROBADA" | "ENVIADA";

export interface Propuesta {
  id: string;
  licitacion_id: string;
  tipo: TipoPropuesta;
  version: number;
  estado: EstadoPropuesta;
  contenido_json: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
}

export type CategoriaChecklist = "LEGAL" | "FISCAL" | "TECNICO" | "ECONOMICO" | "ESPECIFICO";
export type EstadoChecklistItem = "PENDIENTE" | "COMPLETO" | "NO_APLICA";

export interface ChecklistItem {
  id: string;
  licitacion_id: string;
  categoria: CategoriaChecklist;
  descripcion: string;
  fundamento_legal: string | null;
  vigencia_requerida: string | null;
  formato_aceptado: string | null;
  requerido: boolean;
  estado: EstadoChecklistItem;
  documento_id: string | null;
}

export interface DocumentacionRequeridaItem {
  descripcion: string;
  categoria: CategoriaChecklist;
  fundamento_legal: string | null;
  vigencia_requerida: string | null;
  formato_aceptado: string | null;
  requerido: boolean;
}

export interface CriterioEvaluacion {
  criterio: string;
  ponderacion_porcentaje: number | null;
  descripcion: string | null;
}

export interface GarantiaItem {
  tipo: string;
  monto_o_porcentaje: string | null;
  vigencia: string | null;
  descripcion: string | null;
}

export interface FechasAnalisis {
  fecha_publicacion?: string | null;
  fecha_junta_aclaraciones?: string | null;
  fecha_visita?: string | null;
  fecha_entrega_propuesta?: string | null;
  fecha_apertura_tecnica?: string | null;
  fecha_apertura_economica?: string | null;
  fecha_fallo?: string | null;
}

export interface AnalisisBases {
  id: string;
  licitacion_id: string;
  objeto_contrato: string | null;
  tipo_procedimiento: string | null;
  monto_maximo_estimado: number | null;
  moneda: string | null;
  fechas_json: FechasAnalisis;
  requisitos_legales_json: string[];
  documentacion_requerida_json: DocumentacionRequeridaItem[];
  criterios_evaluacion_json: CriterioEvaluacion[];
  garantias_json: GarantiaItem[];
  forma_presentacion: string | null;
  notas_json: { confianza_por_seccion?: Record<string, NivelConfianza> };
  nivel_confianza: NivelConfianza | null;
  created_at: string;
}

export interface PropuestaEconomicaPartida {
  id: string;
  licitacion_id: string;
  partida_id: string | null;
  descripcion: string;
  cantidad: number | null;
  unidad: string | null;
  precio_unitario_ofertado: number | null;
  subtotal: number | null;
  iva: number | null;
  total: number | null;
  margen_porcentaje: number | null;
  precio_referencia_mercado: number | null;
}

export interface PropuestaEconomicaConfig {
  id: string;
  licitacion_id: string;
  tipo_precio: string | null;
  incluye_iva: boolean;
  moneda: string;
  condiciones_pago: string | null;
  tiempo_entrega_dias: number | null;
  validez_oferta_dias: number | null;
}

export interface EstudioMercado {
  id: string;
  licitacion_id: string;
  partida_id: string | null;
  precio_minimo: number | null;
  precio_maximo: number | null;
  precio_promedio: number | null;
  precio_recomendado: number | null;
  fuentes_json: unknown[];
  observaciones: string | null;
  nivel_confianza: NivelConfianza | null;
  created_at: string;
}

export type EstadoJunta = "BORRADOR" | "ENVIADA" | "RESPONDIDA";

export interface JuntaAclaraciones {
  id: string;
  licitacion_id: string;
  preguntas_json: unknown[];
  respuestas_json: unknown[];
  estado: EstadoJunta;
  created_at: string;
}

export interface ActividadLog {
  id: string;
  licitacion_id: string;
  user_id: string | null;
  accion: string;
  metadata_json: Record<string, unknown>;
  created_at: string;
}

export interface EstadoConfig {
  id: string;
  estado_id: EstadoId;
  nombre_portal: string;
  url_portal: string | null;
  sistema_publicacion: string;
  requisitos_extra_json: unknown[];
  instrucciones_carga: string | null;
}

export interface EmpresaPerfil {
  id: string;
  organization_id: string;
  razon_social: string | null;
  rfc: string | null;
  giro: string | null;
  experiencia_anos: number | null;
  certificaciones_json: unknown[];
  clientes_referencia_json: unknown[];
  logo_url: string | null;
  updated_at: string;
}

export interface DocumentChunk {
  id: string;
  documento_id: string;
  chunk_index: number;
  contenido: string;
  embedding: number[] | null;
  metadata_json: Record<string, unknown>;
}

export interface DashboardStats {
  totalActivas: number;
  proximasAVencer: number;
  enPreparacion: number;
  enviadasEsteMes: number;
}
