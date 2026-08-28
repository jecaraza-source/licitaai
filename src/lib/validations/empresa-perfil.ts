import { z } from "zod";

// P1.1 — antes de este schema, empresa-perfil POST/PUT no validaban NI UN
// SOLO campo (el body se leía con `body.campo ?? null`, sin typeof/shape
// check alguno) — el mayor hueco de validación de todo el inventario de
// rutas (ver docs/api-contracts.md). Los campos numéricos ya llegan como
// number real desde empresa-perfil-form.tsx (convierte con `Number(...)`
// antes de enviar), así que z.number() no rompe el payload actual.

const textoNullable = z.string().trim().max(2000).nullable().optional();
const numeroNullable = z.number().finite().nullable().optional();
const arrayJson = z
  .array(z.record(z.string(), z.unknown()))
  .optional()
  .default([]);

// Formato estándar SAT: 3-4 letras (morales/físicas) + 6 dígitos (AAMMDD) +
// 3 caracteres alfanuméricos de homoclave.
const RFC_REGEX = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;

export const empresaPerfilSchema = z.object({
  razon_social: textoNullable,
  rfc: z
    .string()
    .trim()
    .toUpperCase()
    .regex(RFC_REGEX, "RFC inválido")
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
  giro: textoNullable,
  experiencia_anos: numeroNullable,
  certificaciones_json: arrayJson,
  clientes_referencia_json: arrayJson,
  logo_url: z.string().trim().max(2000).nullable().optional(),
  // Formato hex estricto: estos colores se interpolan en un bloque <style>
  // del layout (P1.6 — evita inyección de CSS a nivel de organización).
  color_primario: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?$/, "Debe ser un color hex (#rgb o #rrggbb)")
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
  color_secundario: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?$/, "Debe ser un color hex (#rgb o #rrggbb)")
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
  objeto_social: textoNullable,
  acta_escritura_numero: textoNullable,
  acta_escritura_fecha: textoNullable,
  acta_notario: textoNullable,
  acta_notaria_numero: textoNullable,
  acta_notaria_estado: textoNullable,
  acta_registro_publico: textoNullable,
  representante_legal_nombre: textoNullable,
  representante_legal_escritura_numero: textoNullable,
  representante_legal_escritura_fecha: textoNullable,
  representante_legal_notario: textoNullable,
  representante_legal_notaria_numero: textoNullable,
  representante_legal_notaria_estado: textoNullable,
  representante_legal_registro_publico: textoNullable,
  domicilio_fiscal: textoNullable,
  domicilio_notificaciones: textoNullable,
  correo_notificaciones: z
    .string()
    .trim()
    .email("Correo inválido")
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
  // Mismo criterio que el `body.nacionalidad || "Mexicana"` original:
  // vacío/null/undefined caen todos al default, no solo undefined.
  nacionalidad: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? "Mexicana" : v),
    z.string().trim().max(100),
  ),
  normas_oficiales_aplican: z.boolean().optional().default(false),
  normas_oficiales_detalle: textoNullable,
  cuenta_personal_discapacidad: z.boolean().optional().default(false),
  estratificacion_mipyme: textoNullable,
  socios_accionistas_json: arrayJson,
  garantia_tecnica_meses: numeroNullable,
  garantia_tecnica_detalle: textoNullable,
  soporte_tecnico_contacto: textoNullable,
  tiempo_inicio_servicio_dias: numeroNullable,
  personal_tecnico_json: arrayJson,
  infraestructura_equipo_json: arrayJson,
  licencias_permisos_json: arrayJson,
});

export type EmpresaPerfilInput = z.output<typeof empresaPerfilSchema>;
