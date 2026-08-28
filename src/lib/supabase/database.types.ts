export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      actividad_log: {
        Row: {
          accion: string
          created_at: string
          id: string
          licitacion_id: string
          metadata_json: Json | null
          user_id: string | null
        }
        Insert: {
          accion: string
          created_at?: string
          id?: string
          licitacion_id: string
          metadata_json?: Json | null
          user_id?: string | null
        }
        Update: {
          accion?: string
          created_at?: string
          id?: string
          licitacion_id?: string
          metadata_json?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "actividad_log_licitacion_id_fkey"
            columns: ["licitacion_id"]
            isOneToOne: false
            referencedRelation: "licitaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actividad_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_budget_ledger: {
        Row: {
          cache_hit: boolean
          created_at: string
          estado: string
          id: number
          job_id: string | null
          modelo: string | null
          monto_usd: number
          organization_id: string
          reserva_id: string | null
          tipo: string | null
          tokens_input: number
          tokens_output: number
        }
        Insert: {
          cache_hit?: boolean
          created_at?: string
          estado: string
          id?: never
          job_id?: string | null
          modelo?: string | null
          monto_usd?: number
          organization_id: string
          reserva_id?: string | null
          tipo?: string | null
          tokens_input?: number
          tokens_output?: number
        }
        Update: {
          cache_hit?: boolean
          created_at?: string
          estado?: string
          id?: never
          job_id?: string | null
          modelo?: string | null
          monto_usd?: number
          organization_id?: string
          reserva_id?: string | null
          tipo?: string | null
          tokens_input?: number
          tokens_output?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_budget_ledger_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_model_pricing: {
        Row: {
          actualizado_at: string
          input_usd_por_1m: number
          modelo: string
          output_usd_por_1m: number
        }
        Insert: {
          actualizado_at?: string
          input_usd_por_1m: number
          modelo: string
          output_usd_por_1m: number
        }
        Update: {
          actualizado_at?: string
          input_usd_por_1m?: number
          modelo?: string
          output_usd_por_1m?: number
        }
        Relationships: []
      }
      ai_org_policy: {
        Row: {
          alertas_umbral_pct: number[]
          created_at: string
          cuota_mensual_usd: number
          limite_diario_usd: number
          limite_por_operacion_usd: number
          max_concurrent_jobs: number
          max_reintentos_facturables: number
          modelos_permitidos: string[]
          organization_id: string
          politica_modelo: string
          updated_at: string
        }
        Insert: {
          alertas_umbral_pct?: number[]
          created_at?: string
          cuota_mensual_usd?: number
          limite_diario_usd?: number
          limite_por_operacion_usd?: number
          max_concurrent_jobs?: number
          max_reintentos_facturables?: number
          modelos_permitidos?: string[]
          organization_id: string
          politica_modelo?: string
          updated_at?: string
        }
        Update: {
          alertas_umbral_pct?: number[]
          created_at?: string
          cuota_mensual_usd?: number
          limite_diario_usd?: number
          limite_por_operacion_usd?: number
          max_concurrent_jobs?: number
          max_reintentos_facturables?: number
          modelos_permitidos?: string[]
          organization_id?: string
          politica_modelo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_org_policy_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_result_citations: {
        Row: {
          ai_result_id: string
          document_chunk_id: string | null
          documento_id: string | null
          extracto: string | null
          id: string
          pagina: number | null
          score: number | null
          seccion: string | null
        }
        Insert: {
          ai_result_id: string
          document_chunk_id?: string | null
          documento_id?: string | null
          extracto?: string | null
          id?: string
          pagina?: number | null
          score?: number | null
          seccion?: string | null
        }
        Update: {
          ai_result_id?: string
          document_chunk_id?: string | null
          documento_id?: string | null
          extracto?: string | null
          id?: string
          pagina?: number | null
          score?: number | null
          seccion?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_result_citations_ai_result_id_fkey"
            columns: ["ai_result_id"]
            isOneToOne: false
            referencedRelation: "ai_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_result_citations_document_chunk_id_fkey"
            columns: ["document_chunk_id"]
            isOneToOne: false
            referencedRelation: "document_chunks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_result_citations_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_results: {
        Row: {
          aprobado_at: string | null
          aprobado_por: string | null
          costo_usd: number | null
          created_at: string
          documento_id: string | null
          documento_sha256: string | null
          documento_version: number | null
          estado_aprobacion: string
          id: string
          job_id: string | null
          latencia_ms: number | null
          modelo: string | null
          nivel_confianza: string | null
          organization_id: string
          origen: string
          params_json: Json
          prompt_template_id: string | null
          prompt_version: number | null
          provider: string | null
          recurso_id: string
          recurso_tipo: string
          reemplaza_a: string | null
          resultado_json: Json
          reused_from: string | null
          salida_incompleta: boolean
          tipo_analisis: string
          tokens_input: number | null
          tokens_output: number | null
        }
        Insert: {
          aprobado_at?: string | null
          aprobado_por?: string | null
          costo_usd?: number | null
          created_at?: string
          documento_id?: string | null
          documento_sha256?: string | null
          documento_version?: number | null
          estado_aprobacion?: string
          id?: string
          job_id?: string | null
          latencia_ms?: number | null
          modelo?: string | null
          nivel_confianza?: string | null
          organization_id: string
          origen?: string
          params_json?: Json
          prompt_template_id?: string | null
          prompt_version?: number | null
          provider?: string | null
          recurso_id: string
          recurso_tipo: string
          reemplaza_a?: string | null
          resultado_json: Json
          reused_from?: string | null
          salida_incompleta?: boolean
          tipo_analisis: string
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Update: {
          aprobado_at?: string | null
          aprobado_por?: string | null
          costo_usd?: number | null
          created_at?: string
          documento_id?: string | null
          documento_sha256?: string | null
          documento_version?: number | null
          estado_aprobacion?: string
          id?: string
          job_id?: string | null
          latencia_ms?: number | null
          modelo?: string | null
          nivel_confianza?: string | null
          organization_id?: string
          origen?: string
          params_json?: Json
          prompt_template_id?: string | null
          prompt_version?: number | null
          provider?: string | null
          recurso_id?: string
          recurso_tipo?: string
          reemplaza_a?: string | null
          resultado_json?: Json
          reused_from?: string | null
          salida_incompleta?: boolean
          tipo_analisis?: string
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_results_aprobado_por_fkey"
            columns: ["aprobado_por"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_results_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_results_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_results_reemplaza_a_fkey"
            columns: ["reemplaza_a"]
            isOneToOne: false
            referencedRelation: "ai_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_results_reused_from_fkey"
            columns: ["reused_from"]
            isOneToOne: false
            referencedRelation: "ai_results"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_log: {
        Row: {
          created_at: string
          funcion: string
          id: number
          input_tokens: number
          modelo: string
          organization_id: string
          output_tokens: number
          user_id: string | null
        }
        Insert: {
          created_at?: string
          funcion: string
          id?: never
          input_tokens?: number
          modelo: string
          organization_id: string
          output_tokens?: number
          user_id?: string | null
        }
        Update: {
          created_at?: string
          funcion?: string
          id?: never
          input_tokens?: number
          modelo?: string
          organization_id?: string
          output_tokens?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      analisis_bases: {
        Row: {
          ai_result_id: string | null
          created_at: string
          criterios_evaluacion_json: Json | null
          documentacion_requerida_json: Json | null
          documento_id: string | null
          especificaciones_tecnicas_json: Json | null
          fechas_json: Json | null
          forma_presentacion: string | null
          garantias_json: Json | null
          id: string
          licitacion_id: string
          moneda: string | null
          monto_maximo_estimado: number | null
          nivel_confianza: string | null
          notas_json: Json | null
          objeto_contrato: string | null
          requisitos_legales_json: Json | null
          tipo_procedimiento: string | null
        }
        Insert: {
          ai_result_id?: string | null
          created_at?: string
          criterios_evaluacion_json?: Json | null
          documentacion_requerida_json?: Json | null
          documento_id?: string | null
          especificaciones_tecnicas_json?: Json | null
          fechas_json?: Json | null
          forma_presentacion?: string | null
          garantias_json?: Json | null
          id?: string
          licitacion_id: string
          moneda?: string | null
          monto_maximo_estimado?: number | null
          nivel_confianza?: string | null
          notas_json?: Json | null
          objeto_contrato?: string | null
          requisitos_legales_json?: Json | null
          tipo_procedimiento?: string | null
        }
        Update: {
          ai_result_id?: string | null
          created_at?: string
          criterios_evaluacion_json?: Json | null
          documentacion_requerida_json?: Json | null
          documento_id?: string | null
          especificaciones_tecnicas_json?: Json | null
          fechas_json?: Json | null
          forma_presentacion?: string | null
          garantias_json?: Json | null
          id?: string
          licitacion_id?: string
          moneda?: string | null
          monto_maximo_estimado?: number | null
          nivel_confianza?: string | null
          notas_json?: Json | null
          objeto_contrato?: string | null
          requisitos_legales_json?: Json | null
          tipo_procedimiento?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analisis_bases_ai_result_id_fkey"
            columns: ["ai_result_id"]
            isOneToOne: false
            referencedRelation: "ai_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analisis_bases_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analisis_bases_licitacion_id_fkey"
            columns: ["licitacion_id"]
            isOneToOne: false
            referencedRelation: "licitaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          accion: string
          actor_id: string | null
          created_at: string
          detalle_json: Json
          hash: string
          id: number
          organization_id: string | null
          prev_hash: string | null
          recurso_id: string | null
          recurso_tipo: string | null
        }
        Insert: {
          accion: string
          actor_id?: string | null
          created_at?: string
          detalle_json?: Json
          hash: string
          id?: never
          organization_id?: string | null
          prev_hash?: string | null
          recurso_id?: string | null
          recurso_tipo?: string | null
        }
        Update: {
          accion?: string
          actor_id?: string | null
          created_at?: string
          detalle_json?: Json
          hash?: string
          id?: never
          organization_id?: string | null
          prev_hash?: string | null
          recurso_id?: string | null
          recurso_tipo?: string | null
        }
        Relationships: []
      }
      checklist_items: {
        Row: {
          aclaracion_id: string | null
          categoria: string
          causa_desechamiento: string | null
          critico: boolean
          descripcion: string
          documento_id: string | null
          estado: string
          fecha_limite: string | null
          formato_aceptado: string | null
          fuente: string | null
          fundamento_legal: string | null
          id: string
          licitacion_id: string
          observaciones: string | null
          requerido: boolean
          responsable_id: string | null
          tipo_formato: string | null
          vigencia_requerida: string | null
        }
        Insert: {
          aclaracion_id?: string | null
          categoria: string
          causa_desechamiento?: string | null
          critico?: boolean
          descripcion: string
          documento_id?: string | null
          estado?: string
          fecha_limite?: string | null
          formato_aceptado?: string | null
          fuente?: string | null
          fundamento_legal?: string | null
          id?: string
          licitacion_id: string
          observaciones?: string | null
          requerido?: boolean
          responsable_id?: string | null
          tipo_formato?: string | null
          vigencia_requerida?: string | null
        }
        Update: {
          aclaracion_id?: string | null
          categoria?: string
          causa_desechamiento?: string | null
          critico?: boolean
          descripcion?: string
          documento_id?: string | null
          estado?: string
          fecha_limite?: string | null
          formato_aceptado?: string | null
          fuente?: string | null
          fundamento_legal?: string | null
          id?: string
          licitacion_id?: string
          observaciones?: string | null
          requerido?: boolean
          responsable_id?: string | null
          tipo_formato?: string | null
          vigencia_requerida?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checklist_items_aclaracion_id_fkey"
            columns: ["aclaracion_id"]
            isOneToOne: false
            referencedRelation: "junta_aclaraciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_items_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_items_licitacion_id_fkey"
            columns: ["licitacion_id"]
            isOneToOne: false
            referencedRelation: "licitaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_items_responsable_id_fkey"
            columns: ["responsable_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_liberacion: {
        Row: {
          id: string
          items_json: Json
          licitacion_id: string
          updated_at: string
        }
        Insert: {
          id?: string
          items_json?: Json
          licitacion_id: string
          updated_at?: string
        }
        Update: {
          id?: string
          items_json?: Json
          licitacion_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_liberacion_licitacion_id_fkey"
            columns: ["licitacion_id"]
            isOneToOne: true
            referencedRelation: "licitaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_templates: {
        Row: {
          categoria: string
          descripcion: string
          estado_id: string
          formato_aceptado: string | null
          fundamento_legal: string | null
          id: string
          requerido: boolean
          vigencia_requerida: string | null
        }
        Insert: {
          categoria: string
          descripcion: string
          estado_id: string
          formato_aceptado?: string | null
          fundamento_legal?: string | null
          id?: string
          requerido?: boolean
          vigencia_requerida?: string | null
        }
        Update: {
          categoria?: string
          descripcion?: string
          estado_id?: string
          formato_aceptado?: string | null
          fundamento_legal?: string | null
          id?: string
          requerido?: boolean
          vigencia_requerida?: string | null
        }
        Relationships: []
      }
      data_retention_policy: {
        Row: {
          activo: boolean
          archiva: boolean
          clase: string
          descripcion: string
          dry_run: boolean
          recurso: string
          retencion_dias: number
          ultima_ejecucion_at: string | null
          ultimo_resultado: Json | null
          updated_at: string
        }
        Insert: {
          activo?: boolean
          archiva?: boolean
          clase: string
          descripcion: string
          dry_run?: boolean
          recurso: string
          retencion_dias: number
          ultima_ejecucion_at?: string | null
          ultimo_resultado?: Json | null
          updated_at?: string
        }
        Update: {
          activo?: boolean
          archiva?: boolean
          clase?: string
          descripcion?: string
          dry_run?: boolean
          recurso?: string
          retencion_dias?: number
          ultima_ejecucion_at?: string | null
          ultimo_resultado?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      deletion_requests: {
        Row: {
          borrado_job_id: string | null
          confirmacion: string
          created_at: string
          datos_purgados_at: string | null
          detalle_json: Json
          estado: string
          export_job_id: string | null
          gracia_dias: number
          id: string
          manifiesto_hash: string | null
          organization_id: string
          programada_para: string
          solicitada_por: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          borrado_job_id?: string | null
          confirmacion: string
          created_at?: string
          datos_purgados_at?: string | null
          detalle_json?: Json
          estado?: string
          export_job_id?: string | null
          gracia_dias?: number
          id?: string
          manifiesto_hash?: string | null
          organization_id: string
          programada_para: string
          solicitada_por?: string | null
          tipo?: string
          updated_at?: string
        }
        Update: {
          borrado_job_id?: string | null
          confirmacion?: string
          created_at?: string
          datos_purgados_at?: string | null
          detalle_json?: Json
          estado?: string
          export_job_id?: string | null
          gracia_dias?: number
          id?: string
          manifiesto_hash?: string | null
          organization_id?: string
          programada_para?: string
          solicitada_por?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deletion_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deletion_requests_solicitada_por_fkey"
            columns: ["solicitada_por"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      document_chunks: {
        Row: {
          chunk_index: number
          contenido: string
          documento_id: string
          embedding: string | null
          id: string
          metadata_json: Json | null
        }
        Insert: {
          chunk_index: number
          contenido: string
          documento_id: string
          embedding?: string | null
          id?: string
          metadata_json?: Json | null
        }
        Update: {
          chunk_index?: number
          contenido?: string
          documento_id?: string
          embedding?: string | null
          id?: string
          metadata_json?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "document_chunks_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
        ]
      }
      documentos: {
        Row: {
          auditoria_json: Json | null
          created_at: string
          firma_digital_json: Json | null
          id: string
          licitacion_id: string
          nombre: string
          procesado: boolean
          procesado_at: string | null
          storage_path: string
          tamanio_bytes: number | null
          tipo_documento: string
        }
        Insert: {
          auditoria_json?: Json | null
          created_at?: string
          firma_digital_json?: Json | null
          id?: string
          licitacion_id: string
          nombre: string
          procesado?: boolean
          procesado_at?: string | null
          storage_path: string
          tamanio_bytes?: number | null
          tipo_documento: string
        }
        Update: {
          auditoria_json?: Json | null
          created_at?: string
          firma_digital_json?: Json | null
          id?: string
          licitacion_id?: string
          nombre?: string
          procesado?: boolean
          procesado_at?: string | null
          storage_path?: string
          tamanio_bytes?: number | null
          tipo_documento?: string
        }
        Relationships: [
          {
            foreignKeyName: "documentos_licitacion_id_fkey"
            columns: ["licitacion_id"]
            isOneToOne: false
            referencedRelation: "licitaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      documentos_corporativos: {
        Row: {
          coincide_empresa: boolean | null
          created_at: string
          datos_extraidos_json: Json
          empresa_perfil_id: string
          fecha_emision: string | null
          id: string
          motivo_no_coincide: string | null
          nombre: string
          nombre_persona_detectado: string | null
          organization_id: string
          razon_social_detectada: string | null
          rfc_detectado: string | null
          storage_path: string
          tipo: string
          vigencia_hasta: string | null
        }
        Insert: {
          coincide_empresa?: boolean | null
          created_at?: string
          datos_extraidos_json?: Json
          empresa_perfil_id: string
          fecha_emision?: string | null
          id?: string
          motivo_no_coincide?: string | null
          nombre: string
          nombre_persona_detectado?: string | null
          organization_id: string
          razon_social_detectada?: string | null
          rfc_detectado?: string | null
          storage_path: string
          tipo: string
          vigencia_hasta?: string | null
        }
        Update: {
          coincide_empresa?: boolean | null
          created_at?: string
          datos_extraidos_json?: Json
          empresa_perfil_id?: string
          fecha_emision?: string | null
          id?: string
          motivo_no_coincide?: string | null
          nombre?: string
          nombre_persona_detectado?: string | null
          organization_id?: string
          razon_social_detectada?: string | null
          rfc_detectado?: string | null
          storage_path?: string
          tipo?: string
          vigencia_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documentos_corporativos_empresa_perfil_id_fkey"
            columns: ["empresa_perfil_id"]
            isOneToOne: false
            referencedRelation: "empresa_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_corporativos_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      empresa_perfil: {
        Row: {
          acta_escritura_fecha: string | null
          acta_escritura_numero: string | null
          acta_notaria_estado: string | null
          acta_notaria_numero: string | null
          acta_notario: string | null
          acta_registro_publico: string | null
          certificaciones_json: Json | null
          clientes_referencia_json: Json | null
          color_primario: string | null
          color_secundario: string | null
          correo_notificaciones: string | null
          cuenta_personal_discapacidad: boolean
          documentos_no_aplican: Json
          domicilio_fiscal: string | null
          domicilio_notificaciones: string | null
          estratificacion_mipyme: string | null
          experiencia_anos: number | null
          garantia_tecnica_detalle: string | null
          garantia_tecnica_meses: number | null
          giro: string | null
          id: string
          infraestructura_equipo_json: Json
          licencias_permisos_json: Json
          logo_url: string | null
          nacionalidad: string
          normas_oficiales_aplican: boolean
          normas_oficiales_detalle: string | null
          objeto_social: string | null
          organization_id: string
          personal_tecnico_json: Json
          razon_social: string | null
          representante_legal_escritura_fecha: string | null
          representante_legal_escritura_numero: string | null
          representante_legal_nombre: string | null
          representante_legal_notaria_estado: string | null
          representante_legal_notaria_numero: string | null
          representante_legal_notario: string | null
          representante_legal_registro_publico: string | null
          rfc: string | null
          socios_accionistas_json: Json
          soporte_tecnico_contacto: string | null
          tiempo_inicio_servicio_dias: number | null
          updated_at: string
        }
        Insert: {
          acta_escritura_fecha?: string | null
          acta_escritura_numero?: string | null
          acta_notaria_estado?: string | null
          acta_notaria_numero?: string | null
          acta_notario?: string | null
          acta_registro_publico?: string | null
          certificaciones_json?: Json | null
          clientes_referencia_json?: Json | null
          color_primario?: string | null
          color_secundario?: string | null
          correo_notificaciones?: string | null
          cuenta_personal_discapacidad?: boolean
          documentos_no_aplican?: Json
          domicilio_fiscal?: string | null
          domicilio_notificaciones?: string | null
          estratificacion_mipyme?: string | null
          experiencia_anos?: number | null
          garantia_tecnica_detalle?: string | null
          garantia_tecnica_meses?: number | null
          giro?: string | null
          id?: string
          infraestructura_equipo_json?: Json
          licencias_permisos_json?: Json
          logo_url?: string | null
          nacionalidad?: string
          normas_oficiales_aplican?: boolean
          normas_oficiales_detalle?: string | null
          objeto_social?: string | null
          organization_id: string
          personal_tecnico_json?: Json
          razon_social?: string | null
          representante_legal_escritura_fecha?: string | null
          representante_legal_escritura_numero?: string | null
          representante_legal_nombre?: string | null
          representante_legal_notaria_estado?: string | null
          representante_legal_notaria_numero?: string | null
          representante_legal_notario?: string | null
          representante_legal_registro_publico?: string | null
          rfc?: string | null
          socios_accionistas_json?: Json
          soporte_tecnico_contacto?: string | null
          tiempo_inicio_servicio_dias?: number | null
          updated_at?: string
        }
        Update: {
          acta_escritura_fecha?: string | null
          acta_escritura_numero?: string | null
          acta_notaria_estado?: string | null
          acta_notaria_numero?: string | null
          acta_notario?: string | null
          acta_registro_publico?: string | null
          certificaciones_json?: Json | null
          clientes_referencia_json?: Json | null
          color_primario?: string | null
          color_secundario?: string | null
          correo_notificaciones?: string | null
          cuenta_personal_discapacidad?: boolean
          documentos_no_aplican?: Json
          domicilio_fiscal?: string | null
          domicilio_notificaciones?: string | null
          estratificacion_mipyme?: string | null
          experiencia_anos?: number | null
          garantia_tecnica_detalle?: string | null
          garantia_tecnica_meses?: number | null
          giro?: string | null
          id?: string
          infraestructura_equipo_json?: Json
          licencias_permisos_json?: Json
          logo_url?: string | null
          nacionalidad?: string
          normas_oficiales_aplican?: boolean
          normas_oficiales_detalle?: string | null
          objeto_social?: string | null
          organization_id?: string
          personal_tecnico_json?: Json
          razon_social?: string | null
          representante_legal_escritura_fecha?: string | null
          representante_legal_escritura_numero?: string | null
          representante_legal_nombre?: string | null
          representante_legal_notaria_estado?: string | null
          representante_legal_notaria_numero?: string | null
          representante_legal_notario?: string | null
          representante_legal_registro_publico?: string | null
          rfc?: string | null
          socios_accionistas_json?: Json
          soporte_tecnico_contacto?: string | null
          tiempo_inicio_servicio_dias?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "empresa_perfil_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      estados_config: {
        Row: {
          estado_id: string
          id: string
          instrucciones_carga: string | null
          nombre_portal: string
          requisitos_extra_json: Json | null
          sistema_publicacion: string
          url_portal: string | null
        }
        Insert: {
          estado_id: string
          id?: string
          instrucciones_carga?: string | null
          nombre_portal: string
          requisitos_extra_json?: Json | null
          sistema_publicacion: string
          url_portal?: string | null
        }
        Update: {
          estado_id?: string
          id?: string
          instrucciones_carga?: string | null
          nombre_portal?: string
          requisitos_extra_json?: Json | null
          sistema_publicacion?: string
          url_portal?: string | null
        }
        Relationships: []
      }
      estudio_mercado: {
        Row: {
          ai_result_id: string | null
          created_at: string
          fuentes_json: Json | null
          id: string
          licitacion_id: string
          nivel_confianza: string | null
          observaciones: string | null
          partida_id: string | null
          precio_maximo: number | null
          precio_minimo: number | null
          precio_promedio: number | null
          precio_recomendado: number | null
        }
        Insert: {
          ai_result_id?: string | null
          created_at?: string
          fuentes_json?: Json | null
          id?: string
          licitacion_id: string
          nivel_confianza?: string | null
          observaciones?: string | null
          partida_id?: string | null
          precio_maximo?: number | null
          precio_minimo?: number | null
          precio_promedio?: number | null
          precio_recomendado?: number | null
        }
        Update: {
          ai_result_id?: string | null
          created_at?: string
          fuentes_json?: Json | null
          id?: string
          licitacion_id?: string
          nivel_confianza?: string | null
          observaciones?: string | null
          partida_id?: string | null
          precio_maximo?: number | null
          precio_minimo?: number | null
          precio_promedio?: number | null
          precio_recomendado?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "estudio_mercado_ai_result_id_fkey"
            columns: ["ai_result_id"]
            isOneToOne: false
            referencedRelation: "ai_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estudio_mercado_licitacion_id_fkey"
            columns: ["licitacion_id"]
            isOneToOne: false
            referencedRelation: "licitaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estudio_mercado_partida_id_fkey"
            columns: ["partida_id"]
            isOneToOne: false
            referencedRelation: "partidas"
            referencedColumns: ["id"]
          },
        ]
      }
      evidencia_envio: {
        Row: {
          created_at: string
          documento_id: string | null
          id: string
          licitacion_id: string
          notas: string | null
          registrado_por: string | null
        }
        Insert: {
          created_at?: string
          documento_id?: string | null
          id?: string
          licitacion_id: string
          notas?: string | null
          registrado_por?: string | null
        }
        Update: {
          created_at?: string
          documento_id?: string | null
          id?: string
          licitacion_id?: string
          notas?: string | null
          registrado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evidencia_envio_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidencia_envio_licitacion_id_fkey"
            columns: ["licitacion_id"]
            isOneToOne: false
            referencedRelation: "licitaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidencia_envio_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          descripcion: string
          enabled: boolean
          key: string
          orgs_excluidas: string[]
          orgs_incluidas: string[]
          rollout_pct: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          descripcion?: string
          enabled?: boolean
          key: string
          orgs_excluidas?: string[]
          orgs_incluidas?: string[]
          rollout_pct?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          descripcion?: string
          enabled?: boolean
          key?: string
          orgs_excluidas?: string[]
          orgs_incluidas?: string[]
          rollout_pct?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feature_flags_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      invitaciones_staff: {
        Row: {
          aceptada_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invitado_por: string | null
          organization_id: string
          rol_jerarquico: string
          token: string
        }
        Insert: {
          aceptada_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invitado_por?: string | null
          organization_id: string
          rol_jerarquico: string
          token?: string
        }
        Update: {
          aceptada_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invitado_por?: string | null
          organization_id?: string
          rol_jerarquico?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitaciones_staff_invitado_por_fkey"
            columns: ["invitado_por"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitaciones_staff_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          authorized_at: string | null
          cancel_solicitada: boolean
          costo_estimado_usd: number | null
          costo_real_usd: number | null
          created_at: string
          dedup_hash: string | null
          error_interno_ref: string | null
          error_seguro: string | null
          estado: string
          expires_at: string
          finished_at: string | null
          id: string
          idempotency_key: string | null
          input_json: Json
          intentos: number
          lease_expires_at: string | null
          max_intentos: number
          modelo: string | null
          next_attempt_at: string | null
          notificado_at: string | null
          organization_id: string
          prioridad: number
          progreso: number
          progreso_detalle: string | null
          provider: string | null
          recurso_id: string | null
          recurso_tipo: string | null
          requested_by: string | null
          reserva_id: string | null
          result_ref: Json | null
          reused_from: string | null
          started_at: string | null
          step_actual: string | null
          tipo: string
          tokens_estimados: number | null
          tokens_input: number | null
          tokens_output: number | null
          updated_at: string
          worker_id: string | null
        }
        Insert: {
          authorized_at?: string | null
          cancel_solicitada?: boolean
          costo_estimado_usd?: number | null
          costo_real_usd?: number | null
          created_at?: string
          dedup_hash?: string | null
          error_interno_ref?: string | null
          error_seguro?: string | null
          estado?: string
          expires_at?: string
          finished_at?: string | null
          id?: string
          idempotency_key?: string | null
          input_json?: Json
          intentos?: number
          lease_expires_at?: string | null
          max_intentos?: number
          modelo?: string | null
          next_attempt_at?: string | null
          notificado_at?: string | null
          organization_id: string
          prioridad?: number
          progreso?: number
          progreso_detalle?: string | null
          provider?: string | null
          recurso_id?: string | null
          recurso_tipo?: string | null
          requested_by?: string | null
          reserva_id?: string | null
          result_ref?: Json | null
          reused_from?: string | null
          started_at?: string | null
          step_actual?: string | null
          tipo: string
          tokens_estimados?: number | null
          tokens_input?: number | null
          tokens_output?: number | null
          updated_at?: string
          worker_id?: string | null
        }
        Update: {
          authorized_at?: string | null
          cancel_solicitada?: boolean
          costo_estimado_usd?: number | null
          costo_real_usd?: number | null
          created_at?: string
          dedup_hash?: string | null
          error_interno_ref?: string | null
          error_seguro?: string | null
          estado?: string
          expires_at?: string
          finished_at?: string | null
          id?: string
          idempotency_key?: string | null
          input_json?: Json
          intentos?: number
          lease_expires_at?: string | null
          max_intentos?: number
          modelo?: string | null
          next_attempt_at?: string | null
          notificado_at?: string | null
          organization_id?: string
          prioridad?: number
          progreso?: number
          progreso_detalle?: string | null
          provider?: string | null
          recurso_id?: string | null
          recurso_tipo?: string | null
          requested_by?: string | null
          reserva_id?: string | null
          result_ref?: Json | null
          reused_from?: string | null
          started_at?: string | null
          step_actual?: string | null
          tipo?: string
          tokens_estimados?: number | null
          tokens_input?: number | null
          tokens_output?: number | null
          updated_at?: string
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_reused_from_fkey"
            columns: ["reused_from"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs_dead_letter: {
        Row: {
          created_at: string
          error_interno_ref: string | null
          error_seguro: string | null
          id: string
          input_json: Json | null
          intentos: number | null
          job_id: string
          motivo: string
          organization_id: string
          recurso_id: string | null
          recurso_tipo: string | null
          tipo: string
        }
        Insert: {
          created_at?: string
          error_interno_ref?: string | null
          error_seguro?: string | null
          id?: string
          input_json?: Json | null
          intentos?: number | null
          job_id: string
          motivo?: string
          organization_id: string
          recurso_id?: string | null
          recurso_tipo?: string | null
          tipo: string
        }
        Update: {
          created_at?: string
          error_interno_ref?: string | null
          error_seguro?: string | null
          id?: string
          input_json?: Json | null
          intentos?: number | null
          job_id?: string
          motivo?: string
          organization_id?: string
          recurso_id?: string | null
          recurso_tipo?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_dead_letter_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      junta_aclaraciones: {
        Row: {
          created_at: string
          estado: string
          id: string
          licitacion_id: string
          preguntas_json: Json
          respuestas_json: Json
        }
        Insert: {
          created_at?: string
          estado?: string
          id?: string
          licitacion_id: string
          preguntas_json?: Json
          respuestas_json?: Json
        }
        Update: {
          created_at?: string
          estado?: string
          id?: string
          licitacion_id?: string
          preguntas_json?: Json
          respuestas_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "junta_aclaraciones_licitacion_id_fkey"
            columns: ["licitacion_id"]
            isOneToOne: true
            referencedRelation: "licitaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      licitacion_jerarquia: {
        Row: {
          ejecutor_autorizado_at: string | null
          ejecutor_id: string | null
          id: string
          integrador_autorizado_at: string | null
          integrador_id: string | null
          licitacion_id: string
          supervisor_autorizado_at: string | null
          supervisor_id: string | null
          updated_at: string
        }
        Insert: {
          ejecutor_autorizado_at?: string | null
          ejecutor_id?: string | null
          id?: string
          integrador_autorizado_at?: string | null
          integrador_id?: string | null
          licitacion_id: string
          supervisor_autorizado_at?: string | null
          supervisor_id?: string | null
          updated_at?: string
        }
        Update: {
          ejecutor_autorizado_at?: string | null
          ejecutor_id?: string | null
          id?: string
          integrador_autorizado_at?: string | null
          integrador_id?: string | null
          licitacion_id?: string
          supervisor_autorizado_at?: string | null
          supervisor_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "licitacion_jerarquia_ejecutor_id_fkey"
            columns: ["ejecutor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licitacion_jerarquia_integrador_id_fkey"
            columns: ["integrador_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licitacion_jerarquia_licitacion_id_fkey"
            columns: ["licitacion_id"]
            isOneToOne: true
            referencedRelation: "licitaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licitacion_jerarquia_supervisor_id_fkey"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      licitaciones: {
        Row: {
          alerta_vencimiento_enviada_at: string | null
          convocante_representante_cargo: string | null
          convocante_representante_nombre: string | null
          created_at: string
          created_by: string | null
          documentos_convocante_no_aplica: Json
          es_investigacion_mercado: boolean
          estado_id: string
          estado_licitacion: string
          fecha_apertura_economica: string | null
          fecha_apertura_tecnica: string | null
          fecha_entrega_propuesta: string | null
          fecha_fallo: string | null
          fecha_junta_aclaraciones: string | null
          fecha_publicacion: string | null
          fecha_visita: string | null
          id: string
          institucion: string
          modalidad_procedimiento: string | null
          monto_maximo: number | null
          numero_expediente: string
          organization_id: string
          sistema: string
          tipo: string
          titulo: string
        }
        Insert: {
          alerta_vencimiento_enviada_at?: string | null
          convocante_representante_cargo?: string | null
          convocante_representante_nombre?: string | null
          created_at?: string
          created_by?: string | null
          documentos_convocante_no_aplica?: Json
          es_investigacion_mercado?: boolean
          estado_id: string
          estado_licitacion?: string
          fecha_apertura_economica?: string | null
          fecha_apertura_tecnica?: string | null
          fecha_entrega_propuesta?: string | null
          fecha_fallo?: string | null
          fecha_junta_aclaraciones?: string | null
          fecha_publicacion?: string | null
          fecha_visita?: string | null
          id?: string
          institucion: string
          modalidad_procedimiento?: string | null
          monto_maximo?: number | null
          numero_expediente: string
          organization_id: string
          sistema: string
          tipo: string
          titulo: string
        }
        Update: {
          alerta_vencimiento_enviada_at?: string | null
          convocante_representante_cargo?: string | null
          convocante_representante_nombre?: string | null
          created_at?: string
          created_by?: string | null
          documentos_convocante_no_aplica?: Json
          es_investigacion_mercado?: boolean
          estado_id?: string
          estado_licitacion?: string
          fecha_apertura_economica?: string | null
          fecha_apertura_tecnica?: string | null
          fecha_entrega_propuesta?: string | null
          fecha_fallo?: string | null
          fecha_junta_aclaraciones?: string | null
          fecha_publicacion?: string | null
          fecha_visita?: string | null
          id?: string
          institucion?: string
          modalidad_procedimiento?: string | null
          monto_maximo?: number | null
          numero_expediente?: string
          organization_id?: string
          sistema?: string
          tipo?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "licitaciones_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licitaciones_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          jurisdiccion: string | null
          nombre: string
          plan: string
          rfc: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          jurisdiccion?: string | null
          nombre: string
          plan?: string
          rfc?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          jurisdiccion?: string | null
          nombre?: string
          plan?: string
          rfc?: string | null
        }
        Relationships: []
      }
      partidas: {
        Row: {
          cantidad: number | null
          descripcion: string
          id: string
          licitacion_id: string
          numero: string
          precio_unitario_referencia: number | null
          unidad: string | null
        }
        Insert: {
          cantidad?: number | null
          descripcion: string
          id?: string
          licitacion_id: string
          numero: string
          precio_unitario_referencia?: number | null
          unidad?: string | null
        }
        Update: {
          cantidad?: number | null
          descripcion?: string
          id?: string
          licitacion_id?: string
          numero?: string
          precio_unitario_referencia?: number | null
          unidad?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partidas_licitacion_id_fkey"
            columns: ["licitacion_id"]
            isOneToOne: false
            referencedRelation: "licitaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      prompt_templates: {
        Row: {
          activo: boolean
          created_at: string
          cuerpo: string
          esquema_salida_json: Json | null
          id: string
          modelo_sugerido: string | null
          nombre: string
          params_json: Json
          version: number
        }
        Insert: {
          activo?: boolean
          created_at?: string
          cuerpo: string
          esquema_salida_json?: Json | null
          id: string
          modelo_sugerido?: string | null
          nombre: string
          params_json?: Json
          version?: number
        }
        Update: {
          activo?: boolean
          created_at?: string
          cuerpo?: string
          esquema_salida_json?: Json | null
          id?: string
          modelo_sugerido?: string | null
          nombre?: string
          params_json?: Json
          version?: number
        }
        Relationships: []
      }
      propuesta_economica_config: {
        Row: {
          condiciones_pago: string | null
          id: string
          incluye_iva: boolean
          licitacion_id: string
          moneda: string
          tiempo_entrega_dias: number | null
          tipo_precio: string | null
          validez_oferta_dias: number | null
        }
        Insert: {
          condiciones_pago?: string | null
          id?: string
          incluye_iva?: boolean
          licitacion_id: string
          moneda?: string
          tiempo_entrega_dias?: number | null
          tipo_precio?: string | null
          validez_oferta_dias?: number | null
        }
        Update: {
          condiciones_pago?: string | null
          id?: string
          incluye_iva?: boolean
          licitacion_id?: string
          moneda?: string
          tiempo_entrega_dias?: number | null
          tipo_precio?: string | null
          validez_oferta_dias?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "propuesta_economica_config_licitacion_id_fkey"
            columns: ["licitacion_id"]
            isOneToOne: true
            referencedRelation: "licitaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      propuesta_economica_partidas: {
        Row: {
          cantidad: number | null
          cantidad_compras_mx: number | null
          descripcion: string
          id: string
          iva: number | null
          licitacion_id: string
          margen_porcentaje: number | null
          partida_id: string | null
          precio_referencia_mercado: number | null
          precio_unitario_compras_mx: number | null
          precio_unitario_ofertado: number | null
          subtotal: number | null
          total: number | null
          total_compras_mx: number | null
          unidad: string | null
        }
        Insert: {
          cantidad?: number | null
          cantidad_compras_mx?: number | null
          descripcion: string
          id?: string
          iva?: number | null
          licitacion_id: string
          margen_porcentaje?: number | null
          partida_id?: string | null
          precio_referencia_mercado?: number | null
          precio_unitario_compras_mx?: number | null
          precio_unitario_ofertado?: number | null
          subtotal?: number | null
          total?: number | null
          total_compras_mx?: number | null
          unidad?: string | null
        }
        Update: {
          cantidad?: number | null
          cantidad_compras_mx?: number | null
          descripcion?: string
          id?: string
          iva?: number | null
          licitacion_id?: string
          margen_porcentaje?: number | null
          partida_id?: string | null
          precio_referencia_mercado?: number | null
          precio_unitario_compras_mx?: number | null
          precio_unitario_ofertado?: number | null
          subtotal?: number | null
          total?: number | null
          total_compras_mx?: number | null
          unidad?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "propuesta_economica_partidas_licitacion_id_fkey"
            columns: ["licitacion_id"]
            isOneToOne: false
            referencedRelation: "licitaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propuesta_economica_partidas_partida_id_fkey"
            columns: ["partida_id"]
            isOneToOne: false
            referencedRelation: "partidas"
            referencedColumns: ["id"]
          },
        ]
      }
      propuestas: {
        Row: {
          contenido_json: Json
          created_at: string
          created_by: string | null
          estado: string
          id: string
          licitacion_id: string
          nombre_version: string | null
          revisado_at: string | null
          revisor_id: string | null
          tipo: string
          version: number
        }
        Insert: {
          contenido_json?: Json
          created_at?: string
          created_by?: string | null
          estado?: string
          id?: string
          licitacion_id: string
          nombre_version?: string | null
          revisado_at?: string | null
          revisor_id?: string | null
          tipo: string
          version?: number
        }
        Update: {
          contenido_json?: Json
          created_at?: string
          created_by?: string | null
          estado?: string
          id?: string
          licitacion_id?: string
          nombre_version?: string | null
          revisado_at?: string | null
          revisor_id?: string | null
          tipo?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "propuestas_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propuestas_licitacion_id_fkey"
            columns: ["licitacion_id"]
            isOneToOne: false
            referencedRelation: "licitaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propuestas_revisor_id_fkey"
            columns: ["revisor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_health: {
        Row: {
          abierto_hasta: string | null
          estado: string
          fallos_consecutivos: number
          provider: string
          ultimo_exito_at: string | null
          ultimo_fallo_at: string | null
          updated_at: string
        }
        Insert: {
          abierto_hasta?: string | null
          estado?: string
          fallos_consecutivos?: number
          provider: string
          ultimo_exito_at?: string | null
          ultimo_fallo_at?: string | null
          updated_at?: string
        }
        Update: {
          abierto_hasta?: string | null
          estado?: string
          fallos_consecutivos?: number
          provider?: string
          ultimo_exito_at?: string | null
          ultimo_fallo_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      rate_limit_hits: {
        Row: {
          created_at: string
          id: number
          ruta: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: never
          ruta: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: never
          ruta?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rate_limit_hits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      referencia_legal_chunks: {
        Row: {
          articulo: string | null
          chunk_index: number
          contenido: string
          embedding: string | null
          id: string
          metadata_json: Json | null
          referencia_documento_id: string
        }
        Insert: {
          articulo?: string | null
          chunk_index: number
          contenido: string
          embedding?: string | null
          id?: string
          metadata_json?: Json | null
          referencia_documento_id: string
        }
        Update: {
          articulo?: string | null
          chunk_index?: number
          contenido?: string
          embedding?: string | null
          id?: string
          metadata_json?: Json | null
          referencia_documento_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referencia_legal_chunks_referencia_documento_id_fkey"
            columns: ["referencia_documento_id"]
            isOneToOne: false
            referencedRelation: "referencia_legal_documentos"
            referencedColumns: ["id"]
          },
        ]
      }
      referencia_legal_documentos: {
        Row: {
          created_at: string
          id: string
          nombre: string
          procesado: boolean
          procesado_at: string | null
          referencia_legal_id: string
          storage_path: string
        }
        Insert: {
          created_at?: string
          id?: string
          nombre: string
          procesado?: boolean
          procesado_at?: string | null
          referencia_legal_id: string
          storage_path: string
        }
        Update: {
          created_at?: string
          id?: string
          nombre?: string
          procesado?: boolean
          procesado_at?: string | null
          referencia_legal_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "referencia_legal_documentos_referencia_legal_id_fkey"
            columns: ["referencia_legal_id"]
            isOneToOne: false
            referencedRelation: "referencias_legales"
            referencedColumns: ["id"]
          },
        ]
      }
      referencias_legales: {
        Row: {
          ambito: string
          created_at: string
          descripcion: string | null
          id: string
          nombre: string
          nombre_completo: string
          orden: number
          tipo: string
          url_oficial: string | null
        }
        Insert: {
          ambito?: string
          created_at?: string
          descripcion?: string | null
          id?: string
          nombre: string
          nombre_completo: string
          orden?: number
          tipo?: string
          url_oficial?: string | null
        }
        Update: {
          ambito?: string
          created_at?: string
          descripcion?: string | null
          id?: string
          nombre?: string
          nombre_completo?: string
          orden?: number
          tipo?: string
          url_oficial?: string | null
        }
        Relationships: []
      }
      requisitos_tecnicos: {
        Row: {
          como_cumple: string | null
          created_at: string
          cumple: boolean | null
          documento_id: string | null
          evidencia: string | null
          id: string
          licitacion_id: string
          obligatorio: boolean
          orden: number
          requisito: string
        }
        Insert: {
          como_cumple?: string | null
          created_at?: string
          cumple?: boolean | null
          documento_id?: string | null
          evidencia?: string | null
          id?: string
          licitacion_id: string
          obligatorio?: boolean
          orden?: number
          requisito: string
        }
        Update: {
          como_cumple?: string | null
          created_at?: string
          cumple?: boolean | null
          documento_id?: string | null
          evidencia?: string | null
          id?: string
          licitacion_id?: string
          obligatorio?: boolean
          orden?: number
          requisito?: string
        }
        Relationships: [
          {
            foreignKeyName: "requisitos_tecnicos_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requisitos_tecnicos_licitacion_id_fkey"
            columns: ["licitacion_id"]
            isOneToOne: false
            referencedRelation: "licitaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      responsabilidades_procedimiento: {
        Row: {
          asignaciones_json: Json
          id: string
          licitacion_id: string
          updated_at: string
        }
        Insert: {
          asignaciones_json?: Json
          id?: string
          licitacion_id: string
          updated_at?: string
        }
        Update: {
          asignaciones_json?: Json
          id?: string
          licitacion_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "responsabilidades_procedimiento_licitacion_id_fkey"
            columns: ["licitacion_id"]
            isOneToOne: true
            referencedRelation: "licitaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      retencion_archive: {
        Row: {
          archivado_at: string
          fila: Json
          fila_id: string | null
          id: number
          organization_id: string | null
          recurso: string
        }
        Insert: {
          archivado_at?: string
          fila: Json
          fila_id?: string | null
          id?: never
          organization_id?: string | null
          recurso: string
        }
        Update: {
          archivado_at?: string
          fila?: Json
          fila_id?: string | null
          id?: never
          organization_id?: string | null
          recurso?: string
        }
        Relationships: []
      }
      seguimiento: {
        Row: {
          acta_apertura_economica_documento_id: string | null
          acta_apertura_tecnica_documento_id: string | null
          acta_fallo_documento_id: string | null
          administrador_contrato_id: string | null
          contrato_documento_id: string | null
          fianza_documento_id: string | null
          garantia_documento_id: string | null
          id: string
          lecciones_aprendidas: string | null
          licitacion_id: string
          lugar_entrega: string | null
          niveles_servicio: string | null
          orden_suministro: string | null
          penalizaciones: string | null
          resultado_json: Json | null
          tags_json: Json | null
          updated_at: string
          vigencia_fin: string | null
          vigencia_inicio: string | null
        }
        Insert: {
          acta_apertura_economica_documento_id?: string | null
          acta_apertura_tecnica_documento_id?: string | null
          acta_fallo_documento_id?: string | null
          administrador_contrato_id?: string | null
          contrato_documento_id?: string | null
          fianza_documento_id?: string | null
          garantia_documento_id?: string | null
          id?: string
          lecciones_aprendidas?: string | null
          licitacion_id: string
          lugar_entrega?: string | null
          niveles_servicio?: string | null
          orden_suministro?: string | null
          penalizaciones?: string | null
          resultado_json?: Json | null
          tags_json?: Json | null
          updated_at?: string
          vigencia_fin?: string | null
          vigencia_inicio?: string | null
        }
        Update: {
          acta_apertura_economica_documento_id?: string | null
          acta_apertura_tecnica_documento_id?: string | null
          acta_fallo_documento_id?: string | null
          administrador_contrato_id?: string | null
          contrato_documento_id?: string | null
          fianza_documento_id?: string | null
          garantia_documento_id?: string | null
          id?: string
          lecciones_aprendidas?: string | null
          licitacion_id?: string
          lugar_entrega?: string | null
          niveles_servicio?: string | null
          orden_suministro?: string | null
          penalizaciones?: string | null
          resultado_json?: Json | null
          tags_json?: Json | null
          updated_at?: string
          vigencia_fin?: string | null
          vigencia_inicio?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seguimiento_acta_apertura_economica_documento_id_fkey"
            columns: ["acta_apertura_economica_documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seguimiento_acta_apertura_tecnica_documento_id_fkey"
            columns: ["acta_apertura_tecnica_documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seguimiento_acta_fallo_documento_id_fkey"
            columns: ["acta_fallo_documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seguimiento_administrador_contrato_id_fkey"
            columns: ["administrador_contrato_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seguimiento_contrato_documento_id_fkey"
            columns: ["contrato_documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seguimiento_fianza_documento_id_fkey"
            columns: ["fianza_documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seguimiento_garantia_documento_id_fkey"
            columns: ["garantia_documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seguimiento_licitacion_id_fkey"
            columns: ["licitacion_id"]
            isOneToOne: true
            referencedRelation: "licitaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      signup_tickets: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          organization_id: string
          rol_jerarquico: string | null
          used_at: string | null
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          organization_id: string
          rol_jerarquico?: string | null
          used_at?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          organization_id?: string
          rol_jerarquico?: string | null
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "signup_tickets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          email: string
          empresa_perfil_id: string | null
          id: string
          nombre: string
          organization_id: string
          rol: string
          rol_jerarquico: string | null
          terminos_aceptados_at: string | null
          terminos_version: string | null
        }
        Insert: {
          created_at?: string
          email: string
          empresa_perfil_id?: string | null
          id: string
          nombre: string
          organization_id: string
          rol?: string
          rol_jerarquico?: string | null
          terminos_aceptados_at?: string | null
          terminos_version?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          empresa_perfil_id?: string | null
          id?: string
          nombre?: string
          organization_id?: string
          rol?: string
          rol_jerarquico?: string | null
          terminos_aceptados_at?: string | null
          terminos_version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_empresa_perfil_id_fkey"
            columns: ["empresa_perfil_id"]
            isOneToOne: false
            referencedRelation: "empresa_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      viabilidad: {
        Row: {
          decidido_at: string | null
          decidido_por: string | null
          decision: string | null
          id: string
          licitacion_id: string
          respuestas_json: Json
          updated_at: string
        }
        Insert: {
          decidido_at?: string | null
          decidido_por?: string | null
          decision?: string | null
          id?: string
          licitacion_id: string
          respuestas_json?: Json
          updated_at?: string
        }
        Update: {
          decidido_at?: string | null
          decidido_por?: string | null
          decision?: string | null
          id?: string
          licitacion_id?: string
          respuestas_json?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "viabilidad_decidido_por_fkey"
            columns: ["decidido_por"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viabilidad_licitacion_id_fkey"
            columns: ["licitacion_id"]
            isOneToOne: true
            referencedRelation: "licitaciones"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _gasto_ia_ventana: {
        Args: { p_desde: string; p_org: string }
        Returns: number
      }
      aceptar_invitacion_staff: {
        Args: { p_token: string }
        Returns: undefined
      }
      aceptar_terminos: { Args: { p_version: string }; Returns: undefined }
      ai_policy_de_org: {
        Args: { p_org: string }
        Returns: {
          alertas_umbral_pct: number[]
          created_at: string
          cuota_mensual_usd: number
          limite_diario_usd: number
          limite_por_operacion_usd: number
          max_concurrent_jobs: number
          max_reintentos_facturables: number
          modelos_permitidos: string[]
          organization_id: string
          politica_modelo: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "ai_org_policy"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      aplicar_plan_a_org: {
        Args: { p_org: string; p_plan: string }
        Returns: undefined
      }
      aprobar_resultado_ia: {
        Args: { p_estado: string; p_result_id: string }
        Returns: {
          aprobado_at: string | null
          aprobado_por: string | null
          costo_usd: number | null
          created_at: string
          documento_id: string | null
          documento_sha256: string | null
          documento_version: number | null
          estado_aprobacion: string
          id: string
          job_id: string | null
          latencia_ms: number | null
          modelo: string | null
          nivel_confianza: string | null
          organization_id: string
          origen: string
          params_json: Json
          prompt_template_id: string | null
          prompt_version: number | null
          provider: string | null
          recurso_id: string
          recurso_tipo: string
          reemplaza_a: string | null
          resultado_json: Json
          reused_from: string | null
          salida_incompleta: boolean
          tipo_analisis: string
          tokens_input: number | null
          tokens_output: number | null
        }
        SetofOptions: {
          from: "*"
          to: "ai_results"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      buscar_referencias_texto: {
        Args: {
          match_count?: number
          query_text: string
          referencia_legal_id_param?: string
        }
        Returns: {
          articulo: string
          chunk_id: string
          contenido: string
          rank: number
          referencia_documento_id: string
          referencia_legal_id: string
          referencia_nombre: string
          referencia_nombre_completo: string
        }[]
      }
      cancelar_borrado_organizacion: {
        Args: never
        Returns: {
          borrado_job_id: string | null
          confirmacion: string
          created_at: string
          datos_purgados_at: string | null
          detalle_json: Json
          estado: string
          export_job_id: string | null
          gracia_dias: number
          id: string
          manifiesto_hash: string | null
          organization_id: string
          programada_para: string
          solicitada_por: string | null
          tipo: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "deletion_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cancelar_job: {
        Args: { p_job_id: string }
        Returns: {
          authorized_at: string | null
          cancel_solicitada: boolean
          costo_estimado_usd: number | null
          costo_real_usd: number | null
          created_at: string
          dedup_hash: string | null
          error_interno_ref: string | null
          error_seguro: string | null
          estado: string
          expires_at: string
          finished_at: string | null
          id: string
          idempotency_key: string | null
          input_json: Json
          intentos: number
          lease_expires_at: string | null
          max_intentos: number
          modelo: string | null
          next_attempt_at: string | null
          notificado_at: string | null
          organization_id: string
          prioridad: number
          progreso: number
          progreso_detalle: string | null
          provider: string | null
          recurso_id: string | null
          recurso_tipo: string | null
          requested_by: string | null
          reserva_id: string | null
          result_ref: Json | null
          reused_from: string | null
          started_at: string | null
          step_actual: string | null
          tipo: string
          tokens_estimados: number | null
          tokens_input: number | null
          tokens_output: number | null
          updated_at: string
          worker_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cb_estado: { Args: { p_provider: string }; Returns: string }
      cb_registrar_exito: { Args: { p_provider: string }; Returns: undefined }
      cb_registrar_fallo: {
        Args: {
          p_abierto_segundos?: number
          p_provider: string
          p_umbral?: number
        }
        Returns: string
      }
      check_ai_budget: { Args: { p_limite_diario?: number }; Returns: boolean }
      check_rate_limit: {
        Args: { p_max_por_minuto?: number; p_ruta: string }
        Returns: boolean
      }
      cleanup_expired_signup_tickets: { Args: never; Returns: number }
      completar_job: {
        Args: {
          p_costo?: number
          p_job_id: string
          p_modelo?: string
          p_provider?: string
          p_result_ref: Json
          p_tokens_input?: number
          p_tokens_output?: number
        }
        Returns: {
          authorized_at: string | null
          cancel_solicitada: boolean
          costo_estimado_usd: number | null
          costo_real_usd: number | null
          created_at: string
          dedup_hash: string | null
          error_interno_ref: string | null
          error_seguro: string | null
          estado: string
          expires_at: string
          finished_at: string | null
          id: string
          idempotency_key: string | null
          input_json: Json
          intentos: number
          lease_expires_at: string | null
          max_intentos: number
          modelo: string | null
          next_attempt_at: string | null
          notificado_at: string | null
          organization_id: string
          prioridad: number
          progreso: number
          progreso_detalle: string | null
          provider: string | null
          recurso_id: string | null
          recurso_tipo: string | null
          requested_by: string | null
          reserva_id: string | null
          result_ref: Json | null
          reused_from: string | null
          started_at: string | null
          step_actual: string | null
          tipo: string
          tokens_estimados: number | null
          tokens_input: number | null
          tokens_output: number | null
          updated_at: string
          worker_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      conciliar_presupuesto_ia: {
        Args: {
          p_modelo: string
          p_organization_id: string
          p_reserva_id: string
          p_tokens_input: number
          p_tokens_output: number
        }
        Returns: undefined
      }
      crear_job: {
        Args: {
          p_dedup_hash?: string
          p_expires_in?: string
          p_idempotency_key?: string
          p_input?: Json
          p_max_intentos?: number
          p_prioridad?: number
          p_recurso_id?: string
          p_recurso_tipo?: string
          p_reserva_id?: string
          p_tipo: string
        }
        Returns: {
          authorized_at: string | null
          cancel_solicitada: boolean
          costo_estimado_usd: number | null
          costo_real_usd: number | null
          created_at: string
          dedup_hash: string | null
          error_interno_ref: string | null
          error_seguro: string | null
          estado: string
          expires_at: string
          finished_at: string | null
          id: string
          idempotency_key: string | null
          input_json: Json
          intentos: number
          lease_expires_at: string | null
          max_intentos: number
          modelo: string | null
          next_attempt_at: string | null
          notificado_at: string | null
          organization_id: string
          prioridad: number
          progreso: number
          progreso_detalle: string | null
          provider: string | null
          recurso_id: string | null
          recurso_tipo: string | null
          requested_by: string | null
          reserva_id: string | null
          result_ref: Json | null
          reused_from: string | null
          started_at: string | null
          step_actual: string | null
          tipo: string
          tokens_estimados: number | null
          tokens_input: number | null
          tokens_output: number | null
          updated_at: string
          worker_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_organization_for_signup: {
        Args: { p_nombre: string; p_rfc?: string }
        Returns: string
      }
      cron_job_existe: { Args: { p_jobname: string }; Returns: boolean }
      disparar_worker: { Args: never; Returns: undefined }
      ejecutar_limpieza_retencion: {
        Args: { p_forzar_dry_run?: boolean }
        Returns: Json
      }
      estimar_costo_ia: {
        Args: {
          p_modelo: string
          p_tokens_input: number
          p_tokens_output: number
        }
        Returns: number
      }
      expirar_jobs: { Args: never; Returns: number }
      exportar_datos_organizacion: { Args: { p_org: string }; Returns: Json }
      extension_existe: { Args: { p_nombre: string }; Returns: boolean }
      fallar_job: {
        Args: {
          p_error_interno_ref?: string
          p_error_seguro: string
          p_job_id: string
          p_reintentable?: boolean
        }
        Returns: {
          authorized_at: string | null
          cancel_solicitada: boolean
          costo_estimado_usd: number | null
          costo_real_usd: number | null
          created_at: string
          dedup_hash: string | null
          error_interno_ref: string | null
          error_seguro: string | null
          estado: string
          expires_at: string
          finished_at: string | null
          id: string
          idempotency_key: string | null
          input_json: Json
          intentos: number
          lease_expires_at: string | null
          max_intentos: number
          modelo: string | null
          next_attempt_at: string | null
          notificado_at: string | null
          organization_id: string
          prioridad: number
          progreso: number
          progreso_detalle: string | null
          provider: string | null
          recurso_id: string | null
          recurso_tipo: string | null
          requested_by: string | null
          reserva_id: string | null
          result_ref: Json | null
          reused_from: string | null
          started_at: string | null
          step_actual: string | null
          tipo: string
          tokens_estimados: number | null
          tokens_input: number | null
          tokens_output: number | null
          updated_at: string
          worker_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      finalizar_borrados_completados: { Args: never; Returns: Json }
      guardar_propuesta_economica: {
        Args: { p_config?: Json; p_licitacion_id: string; p_partidas?: Json }
        Returns: undefined
      }
      indices_existen: { Args: { p_nombres: string[] }; Returns: boolean }
      invitacion_info: {
        Args: { p_token: string }
        Returns: {
          email: string
          organizacion_id: string
          organizacion_nombre: string
          rol_jerarquico: string
          valido: boolean
        }[]
      }
      is_write_role: { Args: never; Returns: boolean }
      job_recurso_pertenece: {
        Args: { p_org: string; p_recurso_id: string; p_recurso_tipo: string }
        Returns: boolean
      }
      liberar_mi_reserva_ia: {
        Args: { p_reserva_id: string }
        Returns: undefined
      }
      liberar_reserva_ia: {
        Args: { p_organization_id: string; p_reserva_id: string }
        Returns: undefined
      }
      licitacion_org_matches: {
        Args: { p_licitacion_id: string }
        Returns: boolean
      }
      marcar_job_cancelado: {
        Args: { p_job_id: string }
        Returns: {
          authorized_at: string | null
          cancel_solicitada: boolean
          costo_estimado_usd: number | null
          costo_real_usd: number | null
          created_at: string
          dedup_hash: string | null
          error_interno_ref: string | null
          error_seguro: string | null
          estado: string
          expires_at: string
          finished_at: string | null
          id: string
          idempotency_key: string | null
          input_json: Json
          intentos: number
          lease_expires_at: string | null
          max_intentos: number
          modelo: string | null
          next_attempt_at: string | null
          notificado_at: string | null
          organization_id: string
          prioridad: number
          progreso: number
          progreso_detalle: string | null
          provider: string | null
          recurso_id: string | null
          recurso_tipo: string | null
          requested_by: string | null
          reserva_id: string | null
          result_ref: Json | null
          reused_from: string | null
          started_at: string | null
          step_actual: string | null
          tipo: string
          tokens_estimados: number | null
          tokens_input: number | null
          tokens_output: number | null
          updated_at: string
          worker_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      marcar_job_notificado: { Args: { p_job_id: string }; Returns: boolean }
      metricas_operacion: { Args: never; Returns: Json }
      metricas_valor: { Args: never; Returns: Json }
      persistir_resultado_ia: {
        Args: {
          p_citas?: Json
          p_costo_usd: number
          p_documento_id: string
          p_documento_sha256: string
          p_job_id: string
          p_latencia_ms: number
          p_modelo: string
          p_nivel_confianza: string
          p_organization_id: string
          p_prompt_template_id: string
          p_prompt_version?: number
          p_provider: string
          p_recurso_id: string
          p_recurso_tipo: string
          p_resultado_json: Json
          p_salida_incompleta: boolean
          p_tipo_analisis: string
          p_tokens_input: number
          p_tokens_output: number
        }
        Returns: string
      }
      presupuesto_ia_disponible: {
        Args: { p_org: string }
        Returns: {
          cuota_mensual_usd: number
          diario_disponible_usd: number
          limite_diario_usd: number
          limite_por_operacion_usd: number
          mensual_disponible_usd: number
        }[]
      }
      progreso_job: {
        Args: { p_detalle?: string; p_job_id: string; p_progreso: number }
        Returns: undefined
      }
      promover_borrados_vencidos: { Args: never; Returns: Json }
      purgar_cuentas_organizacion: { Args: { p_org: string }; Returns: number }
      reclamar_jobs: {
        Args: { p_limite?: number; p_worker_id: string }
        Returns: {
          authorized_at: string | null
          cancel_solicitada: boolean
          costo_estimado_usd: number | null
          costo_real_usd: number | null
          created_at: string
          dedup_hash: string | null
          error_interno_ref: string | null
          error_seguro: string | null
          estado: string
          expires_at: string
          finished_at: string | null
          id: string
          idempotency_key: string | null
          input_json: Json
          intentos: number
          lease_expires_at: string | null
          max_intentos: number
          modelo: string | null
          next_attempt_at: string | null
          notificado_at: string | null
          organization_id: string
          prioridad: number
          progreso: number
          progreso_detalle: string | null
          provider: string | null
          recurso_id: string | null
          recurso_tipo: string | null
          requested_by: string | null
          reserva_id: string | null
          result_ref: Json | null
          reused_from: string | null
          started_at: string | null
          step_actual: string | null
          tipo: string
          tokens_estimados: number | null
          tokens_input: number | null
          tokens_output: number | null
          updated_at: string
          worker_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      reencolar_por_espera: {
        Args: { p_job_id: string; p_segundos: number }
        Returns: undefined
      }
      reencolar_step_job: {
        Args: {
          p_job_id: string
          p_progreso?: number
          p_result_parcial?: Json
          p_step: string
        }
        Returns: {
          authorized_at: string | null
          cancel_solicitada: boolean
          costo_estimado_usd: number | null
          costo_real_usd: number | null
          created_at: string
          dedup_hash: string | null
          error_interno_ref: string | null
          error_seguro: string | null
          estado: string
          expires_at: string
          finished_at: string | null
          id: string
          idempotency_key: string | null
          input_json: Json
          intentos: number
          lease_expires_at: string | null
          max_intentos: number
          modelo: string | null
          next_attempt_at: string | null
          notificado_at: string | null
          organization_id: string
          prioridad: number
          progreso: number
          progreso_detalle: string | null
          provider: string | null
          recurso_id: string | null
          recurso_tipo: string | null
          requested_by: string | null
          reserva_id: string | null
          result_ref: Json | null
          reused_from: string | null
          started_at: string | null
          step_actual: string | null
          tipo: string
          tokens_estimados: number | null
          tokens_input: number | null
          tokens_output: number | null
          updated_at: string
          worker_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      registrar_auditoria: {
        Args: {
          p_accion: string
          p_detalle?: Json
          p_recurso_id?: string
          p_recurso_tipo?: string
        }
        Returns: undefined
      }
      registrar_uso_ia: {
        Args: {
          p_funcion: string
          p_input_tokens: number
          p_modelo: string
          p_output_tokens: number
        }
        Returns: undefined
      }
      registrar_uso_ia_worker: {
        Args: {
          p_funcion: string
          p_input_tokens: number
          p_modelo: string
          p_organization_id: string
          p_output_tokens: number
          p_user_id: string
        }
        Returns: undefined
      }
      reservar_presupuesto_ia: {
        Args: { p_estimado_usd: number; p_job_id?: string; p_tipo: string }
        Returns: string
      }
      resolver_modelo_ia: {
        Args: {
          p_confianza_baja?: boolean
          p_modelo_deseado: string
          p_org: string
        }
        Returns: string
      }
      revocar_sesiones_organizacion: {
        Args: { p_org: string }
        Returns: number
      }
      search_chunks: {
        Args: {
          documento_id_param?: string
          licitacion_id_param: string
          match_count?: number
          query_embedding: string
        }
        Returns: {
          contenido: string
          documento_id: string
          similarity: number
        }[]
      }
      search_referencia_chunks: {
        Args: {
          match_count?: number
          query_embedding: string
          referencia_legal_id_param?: string
        }
        Returns: {
          articulo: string
          contenido: string
          referencia_documento_id: string
          referencia_legal_id: string
          referencia_nombre: string
          referencia_nombre_completo: string
          similarity: number
        }[]
      }
      sellar_borrado_organizacion: {
        Args: { p_manifiesto: Json; p_org: string }
        Returns: string
      }
      solicitar_borrado_organizacion: {
        Args: { p_confirmacion: string }
        Returns: {
          borrado_job_id: string | null
          confirmacion: string
          created_at: string
          datos_purgados_at: string | null
          detalle_json: Json
          estado: string
          export_job_id: string | null
          gracia_dias: number
          id: string
          manifiesto_hash: string | null
          organization_id: string
          programada_para: string
          solicitada_por: string | null
          tipo: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "deletion_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      tabla_en_realtime: { Args: { p_tabla: string }; Returns: boolean }
      user_org_id: { Args: never; Returns: string }
      user_rol: { Args: never; Returns: string }
      verificar_cadena_auditoria: {
        Args: { p_org: string }
        Returns: {
          rota_en: number
          total: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

