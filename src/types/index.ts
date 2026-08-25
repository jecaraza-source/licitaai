export type Rol = "ADMIN" | "MANAGER" | "ANALYST" | "VIEWER";
export type RolJerarquico = "EJECUTOR" | "INTEGRADOR" | "SUPERVISOR";

export interface StaffOrg {
  id: string;
  nombre: string;
  // Solo presente cuando quien consulta es ADMIN — ver /api/organizacion/staff.
  email?: string;
  rol_jerarquico: RolJerarquico | null;
  created_at: string;
}

export interface LicitacionJerarquia {
  id: string | null;
  licitacion_id: string;
  ejecutor_id: string | null;
  integrador_id: string | null;
  supervisor_id: string | null;
  ejecutor_autorizado_at: string | null;
  integrador_autorizado_at: string | null;
  supervisor_autorizado_at: string | null;
  updated_at: string;
}

export type EstadoLicitacion =
  | "NUEVA"
  | "ANALISIS"
  | "PREPARACION"
  | "ENVIADA"
  | "SEGUIMIENTO"
  | "CERRADA";

export type TipoLicitacion = "ADQUISICION" | "SERVICIOS" | "OBRA_PUBLICA";
export type ModalidadProcedimiento = "ABIERTA" | "RESTRINGIDA" | "INVITACION_TRES";

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
  modalidad_procedimiento: ModalidadProcedimiento | null;
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
  es_investigacion_mercado: boolean;
  analisis_bases?: { objeto_contrato: string | null }[] | null;
}

export interface FirmaDigital {
  firmado_por: string | null;
  rfc: string | null;
  numero_serie: string | null;
  firmado_at: string;
  algoritmo: string;
  firma_base64: string;
  tipo: "interna";
}

export interface AuditoriaDocumento {
  valido: boolean;
  observaciones: string[];
  nivel_riesgo: "VERDE" | "AMARILLO" | "ROJO";
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
  auditoria_json?: AuditoriaDocumento | null;
  firma_digital_json?: FirmaDigital | null;
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
  revisor_id: string | null;
  revisado_at: string | null;
}

export type CategoriaChecklist = "LEGAL" | "FISCAL" | "TECNICO" | "ECONOMICO" | "ESPECIFICO";
export type EstadoChecklistItem = "VERDE" | "AMARILLO" | "ROJO" | "GRIS";

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
  critico: boolean;
  fuente: string | null;
  responsable_id: string | null;
  fecha_limite: string | null;
  causa_desechamiento: string | null;
  observaciones: string | null;
  aclaracion_id: string | null;
  tipo_formato: "A" | "B" | "C" | "D" | null;
}

export interface ChecklistLiberacionItem {
  id: string;
  label: string;
  checked: boolean;
}

export interface ChecklistLiberacion {
  id: string;
  licitacion_id: string;
  items_json: ChecklistLiberacionItem[];
  updated_at: string;
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

export interface EspecificacionTecnica {
  especificacion: string;
  cantidad: string | null;
  obligatorio: boolean;
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
  documento_id: string | null;
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
  especificaciones_tecnicas_json: EspecificacionTecnica[];
  notas_json: {
    confianza_por_seccion?: Record<string, NivelConfianza>;
    documento_analizado?: { id: string; nombre: string } | null;
  };
  nivel_confianza: NivelConfianza | null;
  created_at: string;
}

export interface RequisitoTecnico {
  id: string;
  licitacion_id: string;
  orden: number;
  requisito: string;
  obligatorio: boolean;
  cumple: boolean | null;
  como_cumple: string | null;
  evidencia: string | null;
  documento_id: string | null;
  created_at: string;
}

export type EjeViabilidad =
  | "JURIDICO"
  | "TECNICO"
  | "EXPERIENCIA"
  | "PERSONAL"
  | "CERTIFICACIONES"
  | "COMERCIAL"
  | "LOGISTICO"
  | "FINANCIERO"
  | "ECONOMICO";

export interface RespuestaViabilidad {
  eje: EjeViabilidad;
  respuesta: "SI" | "PARCIAL" | "NO" | null;
  comentario: string;
}

export interface Viabilidad {
  id: string;
  licitacion_id: string;
  respuestas_json: RespuestaViabilidad[];
  decision: "GO" | "NO_GO" | null;
  decidido_por: string | null;
  decidido_at: string | null;
  updated_at: string;
}

export interface EvidenciaEnvio {
  id: string;
  licitacion_id: string;
  documento_id: string | null;
  notas: string | null;
  registrado_por: string | null;
  registrado_por_nombre?: string | null;
  documento_nombre?: string | null;
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
  cantidad_compras_mx: number | null;
  precio_unitario_compras_mx: number | null;
  total_compras_mx: number | null;
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

export interface FuentePrecio {
  nombre: string;
  precio: number | null;
  fecha: string | null;
  url: string | null;
}

export interface EstudioMercado {
  id: string;
  licitacion_id: string;
  partida_id: string | null;
  precio_minimo: number | null;
  precio_maximo: number | null;
  precio_promedio: number | null;
  precio_recomendado: number | null;
  fuentes_json: FuentePrecio[];
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
  color_primario: string | null;
  color_secundario: string | null;
  documentos_no_aplican: string[];
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
  porEstado: Record<EstadoLicitacion, number>;
}

export type FuncionProcedimiento =
  | "COORDINADOR"
  | "JURIDICO"
  | "TECNICO"
  | "COMERCIAL"
  | "FINANZAS"
  | "DIRECCION"
  | "OPERADOR_COMPRAS_MX"
  | "REVISOR";

export interface AsignacionResponsabilidad {
  funcion: FuncionProcedimiento;
  usuario_id: string | null;
}

export interface ResponsabilidadesProcedimiento {
  id: string;
  licitacion_id: string;
  asignaciones_json: AsignacionResponsabilidad[];
  updated_at: string;
}

export type TipoReferenciaLegal = "LEY" | "REGLAMENTO" | "LINEAMIENTO" | "CODIGO";
export type AmbitoReferenciaLegal = "FEDERAL" | "EDOMEX" | "CDMX" | "GENERAL";

export interface ReferenciaLegal {
  id: string;
  nombre: string;
  nombre_completo: string;
  tipo: TipoReferenciaLegal;
  ambito: AmbitoReferenciaLegal;
  descripcion: string | null;
  url_oficial: string | null;
  orden: number;
  con_contenido: boolean;
}

export interface ReferenciaLegalResultadoBusqueda {
  chunk_id: string;
  contenido: string;
  articulo: string | null;
  rank: number;
  referencia_legal_id: string;
  referencia_nombre: string;
  referencia_nombre_completo: string;
  referencia_documento_id: string;
}

export interface ReferenciaLegalFuente {
  indice: number;
  ley: string;
  ley_completa: string;
  articulo: string | null;
  extracto: string;
  url_oficial: string | null;
}

export interface DocumentoCorporativo {
  id: string;
  empresa_perfil_id: string;
  organization_id: string;
  tipo: string;
  nombre: string;
  storage_path: string;
  fecha_emision: string | null;
  vigencia_hasta: string | null;
  coincide_empresa: boolean | null;
  nombre_persona_detectado: string | null;
  created_at: string;
}
