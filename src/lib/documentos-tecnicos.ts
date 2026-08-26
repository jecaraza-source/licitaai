import { Document, Paragraph, TextRun } from "docx";
import type { EmpresaPerfil } from "@/types";
import {
  contratacionTexto,
  encabezado,
  firma,
  introRepresentante,
  type CtxFormulario,
  type LicitacionEncabezado,
} from "@/lib/documentos-formulario-utils";

export const TIPOS_DOCUMENTO_TECNICO = [
  "TEC01",
  "TEC02",
  "TEC03",
  "TEC04",
  "TEC05",
  "TEC06",
  "TEC07",
  "TEC08",
] as const;

export type TipoDocumentoTecnico = (typeof TIPOS_DOCUMENTO_TECNICO)[number];

// Estas son cartas y manifestaciones técnicas formularias, generadas con los
// datos de capacidad técnica de la empresa (Configuración > Datos técnicos).
// No sustituyen el Anexo Técnico ni la propuesta técnica en sí (Anexo "A"),
// que se elaboran en la pestaña Propuesta Técnica y se exportan desde
// Documentos Legales como LEG09.
export const TEC_TITULOS: Record<TipoDocumentoTecnico, string> = {
  TEC01: "Manifestación de experiencia y capacidad técnica",
  TEC02: "Manifestación de infraestructura, personal técnico y equipo",
  TEC03: "Carta de aceptación y cumplimiento de las especificaciones técnicas",
  TEC04: "Carta compromiso de garantía técnica",
  TEC05: "Manifestación de licencias, permisos y certificaciones técnicas vigentes",
  TEC06: "Carta de soporte técnico y mantenimiento",
  TEC07: "Relación de personal técnico asignado al servicio",
  TEC08: "Manifestación de tiempos de inicio y cumplimiento del servicio",
};

const FIELD_LABELS: Partial<Record<keyof EmpresaPerfil, string>> = {
  razon_social: "Razón social",
  representante_legal_nombre: "Representante legal - nombre",
  giro: "Giro",
  experiencia_anos: "Años de experiencia",
  certificaciones_json: "Certificaciones",
  clientes_referencia_json: "Clientes de referencia",
  garantia_tecnica_meses: "Garantía técnica - meses",
  garantia_tecnica_detalle: "Garantía técnica - detalle",
  soporte_tecnico_contacto: "Soporte técnico - contacto",
  tiempo_inicio_servicio_dias: "Tiempo de inicio del servicio - días",
  personal_tecnico_json: "Personal técnico asignado",
  infraestructura_equipo_json: "Infraestructura y equipo",
  licencias_permisos_json: "Licencias y permisos técnicos",
};

const CAMPOS_REQUERIDOS: Record<TipoDocumentoTecnico, (keyof EmpresaPerfil)[]> = {
  TEC01: ["razon_social", "representante_legal_nombre", "giro", "experiencia_anos"],
  TEC02: ["razon_social", "representante_legal_nombre"],
  TEC03: ["razon_social", "representante_legal_nombre"],
  TEC04: ["razon_social", "representante_legal_nombre", "garantia_tecnica_meses"],
  TEC05: ["razon_social", "representante_legal_nombre"],
  TEC06: ["razon_social", "representante_legal_nombre", "soporte_tecnico_contacto"],
  TEC07: ["razon_social", "representante_legal_nombre"],
  TEC08: ["razon_social", "representante_legal_nombre", "tiempo_inicio_servicio_dias"],
};

// Campos de lista con requisito de "al menos un elemento", igual que
// socios_accionistas_json en documentos-legales.ts.
const CAMPOS_LISTA_NO_VACIA: Partial<Record<TipoDocumentoTecnico, keyof EmpresaPerfil>> = {
  TEC02: "infraestructura_equipo_json",
  TEC05: "licencias_permisos_json",
  TEC07: "personal_tecnico_json",
};

export function camposFaltantes(tipo: TipoDocumentoTecnico, empresa: EmpresaPerfil | null): string[] {
  const requeridos = CAMPOS_REQUERIDOS[tipo];
  if (!empresa) {
    const faltantes = requeridos.map((campo) => FIELD_LABELS[campo] ?? campo);
    const campoLista = CAMPOS_LISTA_NO_VACIA[tipo];
    if (campoLista) faltantes.push(FIELD_LABELS[campoLista] ?? campoLista);
    return faltantes;
  }

  const faltantes = requeridos
    .filter((campo) => {
      const valor = empresa[campo];
      return valor === null || valor === undefined || valor === "";
    })
    .map((campo) => FIELD_LABELS[campo] ?? campo);

  const campoLista = CAMPOS_LISTA_NO_VACIA[tipo];
  if (campoLista && (empresa[campoLista] as unknown[]).length === 0) {
    faltantes.push(FIELD_LABELS[campoLista] ?? campoLista);
  }

  return faltantes;
}

export type LicitacionParaDocumentoTecnico = LicitacionEncabezado;

export type Ctx = CtxFormulario<LicitacionParaDocumentoTecnico, EmpresaPerfil>;

const TEC_TEMPLATES: Record<TipoDocumentoTecnico, (ctx: Ctx) => Paragraph[]> = {
  TEC01: (ctx) => {
    const e = ctx.empresa;
    return [
      ...encabezado(TEC_TITULOS.TEC01, ctx),
      new Paragraph({ children: introRepresentante(ctx) }),
      new Paragraph({ text: "" }),
      new Paragraph({
        children: [
          new TextRun(
            `Mi representada cuenta con ${e.experiencia_anos} años de experiencia en el giro de ` +
              `${e.giro}, y cuenta con la capacidad técnica, material y humana suficiente para la ` +
              `correcta y oportuna prestación de los servicios objeto de esta contratación.`,
          ),
        ],
      }),
      ...(e.certificaciones_json.length > 0
        ? [
            new Paragraph({ text: "" }),
            new Paragraph({
              children: [new TextRun({ text: "Certificaciones vigentes:", bold: true })],
            }),
            ...(e.certificaciones_json as string[]).map(
              (item) => new Paragraph({ children: [new TextRun(`• ${item}`)] }),
            ),
          ]
        : []),
      ...(e.clientes_referencia_json.length > 0
        ? [
            new Paragraph({ text: "" }),
            new Paragraph({
              children: [new TextRun({ text: "Clientes de referencia:", bold: true })],
            }),
            ...(e.clientes_referencia_json as string[]).map(
              (item) => new Paragraph({ children: [new TextRun(`• ${item}`)] }),
            ),
          ]
        : []),
      ...firma(ctx),
    ];
  },

  TEC02: (ctx) => {
    const e = ctx.empresa;
    return [
      ...encabezado(TEC_TITULOS.TEC02, ctx),
      new Paragraph({ children: introRepresentante(ctx) }),
      new Paragraph({ text: "" }),
      new Paragraph({
        children: [
          new TextRun(
            "Mi representada cuenta con la siguiente infraestructura, equipo y personal técnico " +
              "necesarios para la efectiva prestación de los servicios:",
          ),
        ],
      }),
      new Paragraph({ text: "" }),
      new Paragraph({ children: [new TextRun({ text: "Infraestructura y equipo:", bold: true })] }),
      ...(e.infraestructura_equipo_json as string[]).map(
        (item) => new Paragraph({ children: [new TextRun(`• ${item}`)] }),
      ),
      ...(e.personal_tecnico_json.length > 0
        ? [
            new Paragraph({ text: "" }),
            new Paragraph({ children: [new TextRun({ text: "Personal técnico:", bold: true })] }),
            ...(e.personal_tecnico_json as string[]).map(
              (item) => new Paragraph({ children: [new TextRun(`• ${item}`)] }),
            ),
          ]
        : []),
      ...firma(ctx),
    ];
  },

  TEC03: (ctx) => [
    ...encabezado(TEC_TITULOS.TEC03, ctx),
    new Paragraph({ children: introRepresentante(ctx) }),
    new Paragraph({ text: "" }),
    new Paragraph({
      children: [
        new TextRun(
          `Ha revisado el contenido del Anexo Técnico de la ${contratacionTexto(ctx)}, así como las ` +
            "especificaciones, características y requisitos técnicos ahí señalados y los que, en su " +
            "caso, resulten de la Junta de Aclaraciones, y manifiesta su total aceptación y compromiso " +
            "de cumplimiento respecto de la totalidad de dichos requisitos.",
        ),
      ],
    }),
    ...firma(ctx),
  ],

  TEC04: (ctx) => {
    const e = ctx.empresa;
    return [
      ...encabezado(TEC_TITULOS.TEC04, ctx),
      new Paragraph({ children: introRepresentante(ctx) }),
      new Paragraph({ text: "" }),
      new Paragraph({
        children: [
          new TextRun(
            `Mi representada garantiza el correcto funcionamiento de los bienes y/o servicios objeto ` +
              `de esta contratación por un período de ${e.garantia_tecnica_meses} meses, contados a ` +
              "partir de la fecha de entrega o de inicio de la prestación del servicio.",
          ),
        ],
      }),
      ...(e.garantia_tecnica_detalle
        ? [
            new Paragraph({ text: "" }),
            new Paragraph({ children: [new TextRun(e.garantia_tecnica_detalle)] }),
          ]
        : []),
      ...firma(ctx),
    ];
  },

  TEC05: (ctx) => {
    const e = ctx.empresa;
    return [
      ...encabezado(TEC_TITULOS.TEC05, ctx),
      new Paragraph({ children: introRepresentante(ctx) }),
      new Paragraph({ text: "" }),
      new Paragraph({
        children: [
          new TextRun(
            "Mi representada cuenta con las siguientes licencias, permisos y certificaciones técnicas " +
              "vigentes, necesarias para la prestación de los servicios objeto de esta contratación:",
          ),
        ],
      }),
      new Paragraph({ text: "" }),
      ...(e.licencias_permisos_json as string[]).map(
        (item) => new Paragraph({ children: [new TextRun(`• ${item}`)] }),
      ),
      ...firma(ctx),
    ];
  },

  TEC06: (ctx) => {
    const e = ctx.empresa;
    return [
      ...encabezado(TEC_TITULOS.TEC06, ctx),
      new Paragraph({ children: introRepresentante(ctx) }),
      new Paragraph({ text: "" }),
      new Paragraph({
        children: [
          new TextRun(
            "Mi representada se compromete a proporcionar soporte técnico y mantenimiento durante la " +
              "vigencia del contrato, a través de:",
          ),
        ],
      }),
      new Paragraph({ text: "" }),
      new Paragraph({ children: [new TextRun({ text: e.soporte_tecnico_contacto ?? "", bold: true })] }),
      ...firma(ctx),
    ];
  },

  TEC07: (ctx) => {
    const e = ctx.empresa;
    return [
      ...encabezado(TEC_TITULOS.TEC07, ctx),
      new Paragraph({ children: introRepresentante(ctx) }),
      new Paragraph({ text: "" }),
      new Paragraph({
        children: [
          new TextRun(
            "El personal técnico que mi representada asignará para la prestación de los servicios es el siguiente:",
          ),
        ],
      }),
      new Paragraph({ text: "" }),
      ...(e.personal_tecnico_json as string[]).map(
        (item) => new Paragraph({ children: [new TextRun(`• ${item}`)] }),
      ),
      ...firma(ctx),
    ];
  },

  TEC08: (ctx) => {
    const e = ctx.empresa;
    return [
      ...encabezado(TEC_TITULOS.TEC08, ctx),
      new Paragraph({ children: introRepresentante(ctx) }),
      new Paragraph({ text: "" }),
      new Paragraph({
        children: [
          new TextRun(
            `Mi representada se compromete a iniciar la prestación de los servicios en un plazo no ` +
              `mayor a ${e.tiempo_inicio_servicio_dias} días naturales, contados a partir de la fecha ` +
              "de notificación del fallo o de la formalización del contrato, y a cumplir con los " +
              "tiempos y plazos señalados en el Anexo Técnico.",
          ),
        ],
      }),
      ...firma(ctx),
    ];
  },
};

export function generarDocumentoTecnico(tipo: TipoDocumentoTecnico, ctx: Ctx): Document {
  return new Document({
    sections: [{ children: TEC_TEMPLATES[tipo](ctx) }],
  });
}
