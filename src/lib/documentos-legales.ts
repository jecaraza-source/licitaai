import { AlignmentType, Document, HeadingLevel, Paragraph, TextRun } from "docx";
import type { EmpresaPerfil } from "@/types";
import {
  contratacionTexto,
  encabezado,
  firma,
  formatFechaLarga,
  introRepresentante,
  type CtxFormulario,
} from "@/lib/documentos-formulario-utils";

export const TIPOS_DOCUMENTO_LEGAL = [
  "LEG01",
  "LEG02",
  "LEG03",
  "LEG04",
  "LEG05",
  "LEG06",
  "LEG07",
  "LEG08",
  "LEG10",
  "LEG11",
  "LEG12",
  "LEG14",
  "LEG15",
  "LEG16",
  "LEG18",
  "LEG19",
  "LEG22",
  "LEG23",
  "LEG27",
] as const;

export type TipoDocumentoLegal = (typeof TIPOS_DOCUMENTO_LEGAL)[number];

// LEG13 (Proposición Económica), LEG20 (Currículum de Servicios), LEG21
// (Manifiesto de Vínculos con Servidores Públicos), LEG24 (identificación
// oficial escaneada) y LEG25 (Opinión de cumplimiento SAT 32-D) no se
// generan aquí: son constancias emitidas por un sistema de terceros (SFP,
// SAT) o documentos de contenido libre/portafolio, no cartas formularias de
// la empresa.
export const LEG_TITULOS: Record<TipoDocumentoLegal, string> = {
  LEG01: "Acreditación de la existencia legal y personalidad jurídica",
  LEG02: "Correo electrónico",
  LEG03: "Manifestación de no encontrarse en los supuestos de los artículos 71 y 90",
  LEG04: "Declaración de integridad",
  LEG05: "Domicilio",
  LEG06: "Nacionalidad mexicana",
  LEG07: "Normas oficiales mexicanas",
  LEG08: "Discapacidad",
  LEG10: 'Anexo "B" - Aspectos administrativos',
  LEG11: 'Anexo "D" - Documentos que deberán ser firmados electrónicamente',
  LEG12: 'Anexo "C" - Acreditación de la existencia legal y personalidad jurídica',
  LEG14:
    'Anexo "G" - Formato para la manifestación de no encontrarse en alguno de los supuestos establecidos por los artículos 71 y 90 antepenúltimo párrafo de la Ley de Adquisiciones, Arrendamientos y Servicios del Sector Público',
  LEG15: 'Anexo "H" - Compromisos con la Transparencia',
  LEG16: "Anexo \"J\" - Manifestación bajo protesta de decir verdad de la estratificación de micro, pequeña o mediana empresa (MIPYMES)",
  LEG18: 'Anexo "I" - Causas de desechamiento',
  LEG19: 'Anexo "N" - Formato de manifestación de ausencia de conflicto de interés',
  LEG22:
    'Anexo "P" - Formato de manifestación de que no podrá subcontratar a otro licitante que haya participado en el procedimiento',
  LEG23: "Declaración de integridad",
  LEG27:
    'Anexo "O" - Formato de manifestación de que el licitante no ejecuta con otro participante acciones que impliquen o tengan por objeto obtener un beneficio o ventaja indebida en el procedimiento',
};

const FIELD_LABELS: Partial<Record<keyof EmpresaPerfil, string>> = {
  razon_social: "Razón social",
  rfc: "RFC",
  objeto_social: "Objeto social",
  acta_escritura_numero: "Acta constitutiva - número de escritura",
  acta_escritura_fecha: "Acta constitutiva - fecha de la escritura",
  acta_notario: "Acta constitutiva - notario público",
  acta_notaria_numero: "Acta constitutiva - número de notaría",
  acta_notaria_estado: "Acta constitutiva - estado de la notaría",
  acta_registro_publico: "Acta constitutiva - registro público",
  representante_legal_nombre: "Representante legal - nombre",
  representante_legal_escritura_numero: "Representante legal - número de escritura",
  representante_legal_escritura_fecha: "Representante legal - fecha de la escritura",
  representante_legal_notario: "Representante legal - notario público",
  representante_legal_notaria_numero: "Representante legal - número de notaría",
  representante_legal_notaria_estado: "Representante legal - estado de la notaría",
  representante_legal_registro_publico: "Representante legal - registro público",
  domicilio_fiscal: "Domicilio fiscal",
  correo_notificaciones: "Correo electrónico para notificaciones",
  estratificacion_mipyme: "Estratificación MIPYME",
  socios_accionistas_json: "Socios / accionistas con control sobre la sociedad",
};

const LICITACION_FIELD_LABELS: Partial<Record<keyof LicitacionParaDocumentoLegal, string>> = {
  convocante_representante_nombre: "Nombre del representante de la convocante que co-firma el Anexo H",
};

const CAMPOS_ACTA: (keyof EmpresaPerfil)[] = [
  "razon_social",
  "rfc",
  "objeto_social",
  "acta_escritura_numero",
  "acta_escritura_fecha",
  "acta_notario",
  "acta_notaria_numero",
  "acta_notaria_estado",
  "acta_registro_publico",
  "domicilio_fiscal",
];

const CAMPOS_REPRESENTANTE: (keyof EmpresaPerfil)[] = [
  "representante_legal_nombre",
  "representante_legal_escritura_numero",
  "representante_legal_escritura_fecha",
  "representante_legal_notario",
  "representante_legal_notaria_numero",
  "representante_legal_notaria_estado",
  "representante_legal_registro_publico",
];

const CAMPOS_REQUERIDOS: Record<TipoDocumentoLegal, (keyof EmpresaPerfil)[]> = {
  LEG01: [...CAMPOS_ACTA, ...CAMPOS_REPRESENTANTE, "correo_notificaciones"],
  LEG02: ["razon_social", "representante_legal_nombre", "correo_notificaciones"],
  LEG03: ["razon_social", "representante_legal_nombre"],
  LEG04: ["razon_social", "representante_legal_nombre"],
  LEG05: ["razon_social", "representante_legal_nombre", "domicilio_fiscal"],
  LEG06: ["razon_social", "representante_legal_nombre"],
  LEG07: ["razon_social", "representante_legal_nombre"],
  LEG08: ["razon_social", "representante_legal_nombre"],
  LEG10: ["razon_social", "representante_legal_nombre", "correo_notificaciones"],
  LEG11: ["razon_social", "representante_legal_nombre"],
  LEG12: [...CAMPOS_ACTA, ...CAMPOS_REPRESENTANTE, "correo_notificaciones"],
  LEG14: ["razon_social", "representante_legal_nombre"],
  LEG15: ["razon_social", "representante_legal_nombre"],
  LEG16: ["razon_social", "representante_legal_nombre", "rfc", "estratificacion_mipyme"],
  LEG18: ["razon_social", "representante_legal_nombre"],
  LEG19: ["razon_social", "representante_legal_nombre"],
  LEG22: ["razon_social", "representante_legal_nombre"],
  LEG23: ["razon_social", "representante_legal_nombre"],
  LEG27: ["razon_social", "representante_legal_nombre"],
};

// Solo LEG15 depende de un dato de la licitación (no de la empresa): el
// representante de la convocante que co-firma el Anexo H.
const CAMPOS_LICITACION_REQUERIDOS: Partial<Record<TipoDocumentoLegal, (keyof LicitacionParaDocumentoLegal)[]>> = {
  LEG15: ["convocante_representante_nombre"],
};

export function camposFaltantes(
  tipo: TipoDocumentoLegal,
  empresa: EmpresaPerfil | null,
  licitacion?: LicitacionParaDocumentoLegal | null,
): string[] {
  const requeridos = CAMPOS_REQUERIDOS[tipo];
  const faltantesEmpresa = !empresa
    ? requeridos.map((campo) => FIELD_LABELS[campo] ?? campo)
    : requeridos
        .filter((campo) => {
          const valor = empresa[campo];
          return valor === null || valor === undefined || valor === "";
        })
        .map((campo) => FIELD_LABELS[campo] ?? campo);

  if (tipo === "LEG19" && empresa && empresa.socios_accionistas_json.length === 0) {
    faltantesEmpresa.push(FIELD_LABELS.socios_accionistas_json ?? "socios_accionistas_json");
  }

  const requeridosLicitacion = CAMPOS_LICITACION_REQUERIDOS[tipo] ?? [];
  const faltantesLicitacion = !licitacion
    ? requeridosLicitacion.map((campo) => LICITACION_FIELD_LABELS[campo] ?? campo)
    : requeridosLicitacion
        .filter((campo) => {
          const valor = licitacion[campo];
          return valor === null || valor === undefined || valor === "";
        })
        .map((campo) => LICITACION_FIELD_LABELS[campo] ?? campo);

  return [...faltantesEmpresa, ...faltantesLicitacion];
}

export interface LicitacionParaDocumentoLegal {
  numero_expediente: string;
  titulo: string;
  institucion: string;
  modalidad_procedimiento: string | null;
  convocante_representante_nombre: string | null;
  convocante_representante_cargo: string | null;
}

export type Ctx = CtxFormulario<LicitacionParaDocumentoLegal, EmpresaPerfil>;

function cuerpoManifestacion7190(ctx: Ctx): Paragraph[] {
  return [
    new Paragraph({ children: introRepresentante(ctx) }),
    new Paragraph({ text: "" }),
    new Paragraph({
      children: [
        new TextRun(
          `El que suscribe, la persona que represento, al igual que los socios y/o accionistas ` +
            `integrantes de la misma, o asociados en común, no se encuentran dentro de alguno de los ` +
            `supuestos comprendidos en los artículos 71 y 90, antepenúltimo párrafo, de la Ley de ` +
            `Adquisiciones, Arrendamientos y Servicios del Sector Público.`,
        ),
      ],
    }),
    new Paragraph({ text: "" }),
    new Paragraph({ children: [new TextRun("Lo anterior para los efectos a que haya lugar.")] }),
  ];
}

function cuerpoDeclaracionIntegridad(ctx: Ctx): Paragraph[] {
  return [
    new Paragraph({ children: introRepresentante(ctx) }),
    new Paragraph({ text: "" }),
    new Paragraph({
      children: [
        new TextRun(
          `Declaración de Integridad. Por sí mismo o través de interpósita persona, se abstendrá de ` +
            `adoptar conductas para que los servidores públicos de ${ctx.licitacion.institucion}, ` +
            `induzcan o alteren las evaluaciones de las proposiciones, el resultado del procedimiento ` +
            `u otros aspectos que otorguen condiciones más ventajosas en relación con los demás participantes.`,
        ),
      ],
    }),
  ];
}

function cuerpoLEG01(ctx: Ctx): Paragraph[] {
  const e = ctx.empresa;
  return [
    new Paragraph({
      children: [
        new TextRun(
          `${e.representante_legal_nombre}, para efecto de acreditar la existencia legal y ` +
            `personalidad jurídica de mi representada, para la suscripción de las proposiciones y, ` +
            `en su caso, firma del contrato, manifiesto bajo protesta de decir verdad, de acuerdo ` +
            `con lo requerido en la ${contratacionTexto(ctx)}, que los datos aquí asentados son ` +
            `ciertos y que cuento con facultades suficientes para comprometerme por mí o por mi representada.`,
        ),
      ],
    }),
    new Paragraph({ text: "" }),
    new Paragraph({ children: [new TextRun(`De la persona moral, ${e.razon_social}:`)] }),
    new Paragraph({ text: "" }),
    new Paragraph({
      children: [
        new TextRun({ text: "Acta constitutiva: ", bold: true }),
        new TextRun(`Escritura pública ${e.acta_escritura_numero} del ${formatFechaLarga(new Date(e.acta_escritura_fecha ?? Date.now()))}.`),
      ],
    }),
    new Paragraph({
      children: [new TextRun({ text: "Objeto social: ", bold: true }), new TextRun(e.objeto_social ?? "")],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Notario Público: ", bold: true }),
        new TextRun(`${e.acta_notario}, Notaría ${e.acta_notaria_numero} de ${e.acta_notaria_estado}.`),
      ],
    }),
    new Paragraph({
      children: [new TextRun({ text: "Registro Público: ", bold: true }), new TextRun(e.acta_registro_publico ?? "")],
    }),
    new Paragraph({
      children: [new TextRun({ text: "Registro Federal de Contribuyentes: ", bold: true }), new TextRun(e.rfc ?? "")],
    }),
    new Paragraph({
      children: [new TextRun({ text: "Domicilio fiscal: ", bold: true }), new TextRun(e.domicilio_fiscal ?? "")],
    }),
    new Paragraph({ text: "" }),
    new Paragraph({
      children: [new TextRun("Del representante legal que suscribe las proposiciones y, en su caso, firmará el contrato:")],
    }),
    new Paragraph({ text: "" }),
    new Paragraph({
      children: [
        new TextRun({ text: "Escritura pública número: ", bold: true }),
        new TextRun(
          `Escritura pública ${e.representante_legal_escritura_numero} del ${formatFechaLarga(new Date(e.representante_legal_escritura_fecha ?? Date.now()))}.`,
        ),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Notario Público: ", bold: true }),
        new TextRun(
          `${e.representante_legal_notario}, Notaría ${e.representante_legal_notaria_numero} de ${e.representante_legal_notaria_estado}.`,
        ),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Registro Público: ", bold: true }),
        new TextRun(e.representante_legal_registro_publico ?? ""),
      ],
    }),
    new Paragraph({ text: "" }),
    new Paragraph({
      children: [new TextRun({ text: "Correo electrónico: ", bold: true }), new TextRun(e.correo_notificaciones ?? "")],
    }),
    new Paragraph({ text: "" }),
    new Paragraph({
      children: [
        new TextRun(
          "De igual forma, en caso de resultar adjudicada mi proposición, me comprometo a presentar " +
            "original y copia fotostática de la documentación que ampara la información contenida en este documento.",
        ),
      ],
    }),
  ];
}

const LEG_TEMPLATES: Record<TipoDocumentoLegal, (ctx: Ctx) => Paragraph[]> = {
  LEG01: (ctx) => [...encabezado(LEG_TITULOS.LEG01, ctx), ...cuerpoLEG01(ctx), ...firma(ctx)],
  LEG12: (ctx) => [...encabezado(LEG_TITULOS.LEG12, ctx), ...cuerpoLEG01(ctx), ...firma(ctx)],

  LEG02: (ctx) => [
    ...encabezado(LEG_TITULOS.LEG02, ctx),
    new Paragraph({ children: introRepresentante(ctx) }),
    new Paragraph({ text: "" }),
    new Paragraph({
      children: [new TextRun({ text: `Correo electrónico: ${ctx.empresa.correo_notificaciones}`, bold: true })],
    }),
    new Paragraph({ text: "" }),
    new Paragraph({
      children: [
        new TextRun(
          "De igual forma, en caso de resultar adjudicada mi proposición, nos comprometemos a presentar " +
            "original y copia fotostática de la documentación que ampara la información contenida en este documento.",
        ),
      ],
    }),
    ...firma(ctx),
  ],

  LEG03: (ctx) => [
    ...encabezado(LEG_TITULOS.LEG03, ctx),
    ...cuerpoManifestacion7190(ctx),
    ...firma(ctx),
  ],
  LEG14: (ctx) => [
    ...encabezado(LEG_TITULOS.LEG14, ctx),
    ...cuerpoManifestacion7190(ctx),
    ...firma(ctx),
  ],

  LEG04: (ctx) => [
    ...encabezado(LEG_TITULOS.LEG04, ctx),
    ...cuerpoDeclaracionIntegridad(ctx),
    ...firma(ctx),
  ],
  LEG23: (ctx) => [
    ...encabezado(LEG_TITULOS.LEG23, ctx),
    ...cuerpoDeclaracionIntegridad(ctx),
    ...firma(ctx),
  ],

  LEG05: (ctx) => [
    ...encabezado(LEG_TITULOS.LEG05, ctx),
    new Paragraph({
      children: [
        new TextRun(
          `${ctx.empresa.representante_legal_nombre}, en mi carácter de representante legal de ` +
            `${ctx.empresa.razon_social}, de acuerdo con lo requerido en la ${contratacionTexto(ctx)}, ` +
            `manifiesto bajo protesta de decir verdad que el domicilio para oír y recibir notificaciones es el siguiente:`,
        ),
      ],
    }),
    new Paragraph({ text: "" }),
    new Paragraph({
      children: [
        new TextRun({
          text: (ctx.empresa.domicilio_notificaciones || ctx.empresa.domicilio_fiscal || "").toUpperCase(),
          bold: true,
        }),
      ],
    }),
    new Paragraph({ text: "" }),
    new Paragraph({
      children: [
        new TextRun(
          "De igual forma, en caso de resultar adjudicada mi proposición, nos comprometemos a presentar " +
            "original y copia fotostática de la documentación que ampara la información contenida en este documento.",
        ),
      ],
    }),
    ...firma(ctx),
  ],

  LEG06: (ctx) => [
    ...encabezado(LEG_TITULOS.LEG06, ctx),
    new Paragraph({
      children: [
        new TextRun(
          `${ctx.empresa.representante_legal_nombre}, de acuerdo con lo requerido en la ` +
            `${contratacionTexto(ctx)}, manifiesto bajo protesta de decir verdad que:`,
        ),
      ],
    }),
    new Paragraph({ text: "" }),
    new Paragraph({
      children: [
        new TextRun(
          `Mi representada es de Nacionalidad ${ctx.empresa.nacionalidad}, y en caso de resultar ` +
            `adjudicada previo a la firma del contrato, presentará para su cotejo, original o copia ` +
            `certificada de los siguientes documentos: Testimonio de la escritura pública en la que ` +
            `conste que fue constituida conforme a las leyes mexicanas y que tiene su domicilio en el territorio nacional.`,
        ),
      ],
    }),
    ...firma(ctx),
  ],

  LEG07: (ctx) => [
    ...encabezado(LEG_TITULOS.LEG07, ctx),
    new Paragraph({ children: introRepresentante(ctx) }),
    new Paragraph({ text: "" }),
    new Paragraph({
      children: [
        new TextRun(
          ctx.empresa.normas_oficiales_aplican
            ? `Para el presente servicio se deberá atender el cumplimiento de las siguientes normas: ${ctx.empresa.normas_oficiales_detalle ?? ""}.`
            : "Para el presente servicio no se requiere el cumplimiento de alguna norma mexicana, normas " +
                "oficiales mexicanas, o normas internacionales de referencia, únicamente se deberá atender " +
                "las características técnicas y prácticas propias de los servicios objeto de la contratación, " +
                "que imperen en el mercado.",
        ),
      ],
    }),
    ...firma(ctx),
  ],

  LEG08: (ctx) => [
    ...encabezado(LEG_TITULOS.LEG08, ctx),
    new Paragraph({ children: introRepresentante(ctx) }),
    new Paragraph({ text: "" }),
    new Paragraph({
      children: [
        new TextRun(
          ctx.empresa.cuenta_personal_discapacidad
            ? "Mi representada SÍ CUENTA CON PERSONAL CON DISCAPACIDAD."
            : "Mi representada NO CUENTA CON PERSONAL CON DISCAPACIDAD.",
        ),
      ],
    }),
    ...firma(ctx),
  ],

  LEG10: (ctx) => {
    const e = ctx.empresa;
    const items = [
      `Nacionalidad Mexicana. Mi representada es de Nacionalidad ${e.nacionalidad}, y en caso de ` +
        `resultar adjudicada previo a la firma del contrato, presentará para su cotejo, original o ` +
        `copia certificada de los siguientes documentos: Testimonio de la escritura pública en la que ` +
        `conste que fue constituida conforme a las leyes mexicanas y que tiene su domicilio en el territorio nacional.`,
      e.normas_oficiales_aplican
        ? `Normas Oficiales Mexicanas. Para el presente servicio se deberá atender el cumplimiento de ` +
          `las siguientes normas: ${e.normas_oficiales_detalle ?? ""}.`
        : "Normas Oficiales Mexicanas. Para el presente servicio no se requiere el cumplimiento de " +
          "alguna norma mexicana, normas oficiales mexicanas, o normas internacionales de referencia, " +
          "únicamente se deberá atender las características técnicas y prácticas propias de los " +
          "servicios objeto de la contratación, que imperen en el mercado.",
      `No impedimento para celebrar contratos con la Administración Pública Federal. A mi representada ` +
        `no se le ha determinado mediante publicación en el Diario Oficial de la Federación impedimento ` +
        `para contratar o celebrar contratos con la Administración Pública Federal.`,
      `Declaración de Integridad. Por sí mismo o través de interpósita persona, se abstendrá de adoptar ` +
        `conductas para que los servidores públicos de ${ctx.licitacion.institucion} induzcan o alteren ` +
        `las evaluaciones de las proposiciones, el resultado del procedimiento u otros aspectos que ` +
        `otorguen condiciones más ventajosas en relación con los demás participantes.`,
      `Tiempos de prestación de los servicios. Que los servicios serán prestados en los términos y ` +
        `plazos requeridos por ${ctx.licitacion.institucion} en la Invitación, el contrato y sus anexos. ` +
        `De igual manera, mi representada cuenta con los recursos materiales, técnicos y humanos, y los ` +
        `medios necesarios para la efectiva prestación de los servicios conforme a los términos ` +
        `señalados en el Anexo "A" de esta Invitación, en los plazos y vigencia que se indiquen para tal efecto.`,
      `Consideración de todos los gastos. Su proposición incluirá todos los servicios, gastos y demás ` +
        `erogaciones que, en su caso, se requieran para la oportuna prestación de los servicios, sin ` +
        `costo adicional para ${ctx.licitacion.institucion}.`,
      `Capacidad técnica, legal, económica y administrativa. Cuenta con la capacidad técnica, económica ` +
        `y administrativa para la correcta y oportuna prestación de los servicios.`,
      `Carácter confidencial de las proposiciones. De conformidad con lo establecido en la Ley Federal ` +
        `de Transparencia y Acceso a la Información Pública, la documentación que se entrega en este ` +
        `procedimiento es pública.`,
      `Periodo de validez de las Proposiciones. Las propuestas técnica y económica presentadas tendrán ` +
        `validez obligatoria de sesenta días naturales, contados a partir de la fecha en la que se ` +
        `celebre el acto de apertura de proposiciones.`,
      `Plazo para reponer los servicios. En caso de resultar ganador, se compromete a reponer los ` +
        `servicios que resultaren rechazados o devueltos, en el plazo señalado en el Anexo "A".`,
      `Aceptación de términos de la Invitación. Ha revisado el contenido de la Invitación y está de ` +
        `acuerdo con todos y cada uno de sus puntos. Asimismo, se sujeta a la Ley de Adquisiciones, ` +
        `Arrendamientos y Servicios de Sector Público, a su Reglamento y a las demás disposiciones ` +
        `jurídicas aplicables, en todos sus aspectos, por lo que dará cumplimiento a dicha Invitación y a la normatividad indicada.`,
      `Precio fijo. Declaro bajo protesta de decir verdad, que los precios que se presentan por mi ` +
        `representada en su propuesta económica serán fijos durante la vigencia del contrato.`,
      `Protección de datos personales. Con fundamento en lo establecido en el numeral 7 del "ACUERDO ` +
        `por el que se expide el protocolo de actuación en materia de contrataciones públicas, ` +
        `otorgamiento y prórroga de licencias, permisos, autorizaciones y concesiones", mi representada ` +
        `otorga su consentimiento para el caso de que terceras personas accedan a los datos personales ` +
        `que esta entregue a la convocante con motivo de la participación en este procedimiento de ` +
        `contratación, en el entendido de que la convocante adoptará las medidas necesarias para su protección.`,
      `Respeto a los Derechos Humanos. En caso de resultar ganadora, mi representada se compromete a: ` +
        `1) Respetar los Derechos Humanos en todas las actividades derivadas del contrato respectivo, ` +
        `que tenga impacto en el entorno físico y social, así como evitar todo tipo de prácticas ` +
        `discriminatorias y de trabajo de menores, procurando realizar acciones en materia de igualdad ` +
        `de género y en materia de protección al ambiente durante toda la vigencia del contrato; y 2) ` +
        `Coadyuvar con las investigaciones derivadas de violación a los Derechos Humanos, lo que implica ` +
        `atender en sus términos y sin argucias todos los requerimientos de información de la Comisión ` +
        `Nacional de los Derechos Humanos y, que de no hacerlo así, se podrían generar responsabilidades ` +
        `para el Licitante, sus representantes legales, los administradores y en su caso, para los socios controladores de mi representada.`,
      `Correo electrónico: la dirección de correo electrónico del Licitante es ${e.correo_notificaciones}.`,
    ];

    return [
      ...encabezado(LEG_TITULOS.LEG10, ctx),
      new Paragraph({
        children: [
          new TextRun(
            `${e.representante_legal_nombre}, en mi carácter de representante legal de ${e.razon_social}, ` +
              `para dar cumplimiento a lo requerido en la ${contratacionTexto(ctx)}, declaro bajo ` +
              `protesta de decir verdad que:`,
          ),
        ],
      }),
      new Paragraph({ text: "" }),
      ...items.flatMap((texto, i) => [
        new Paragraph({ children: [new TextRun(`${i + 1}. ${texto}`)] }),
        new Paragraph({ text: "" }),
      ]),
      ...firma(ctx),
    ];
  },

  LEG11: (ctx) => [
    ...encabezado(LEG_TITULOS.LEG11, ctx),
    new Paragraph({
      children: [
        new TextRun(
          `${ctx.empresa.representante_legal_nombre}, en mi carácter de representante legal de ` +
            `${ctx.empresa.razon_social}, y con relación a la ${contratacionTexto(ctx)}, declaro que mi representada acepta que:`,
        ),
      ],
    }),
    new Paragraph({ text: "" }),
    new Paragraph({
      children: [
        new TextRun(
          "1. Las proposiciones presentadas deberán ser firmadas electrónicamente por los Licitantes o " +
            "sus apoderados; éstas serán enviadas a través de medios remotos de comunicación electrónica, " +
            "se emplearán medios de identificación electrónica, los cuales producirán los mismos efectos " +
            "que las leyes otorgan a los documentos correspondientes y, en consecuencia, tendrán el mismo " +
            "valor probatorio que los documentos firmados autógrafamente.",
        ),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun(
          "2. Deberá presentar el escrito en el que su firmante manifieste, bajo protesta de decir " +
            "verdad, que cuenta con facultades suficientes para comprometerse por sí o por su " +
            "representada para intervenir en el acto de presentación y apertura de proposiciones.",
        ),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun(
          "3. Cada uno de los documentos que integren la proposición y aquéllos distintos a ésta, " +
            "deberán estar foliados en todas y cada una de las hojas que los integren.",
        ),
      ],
    }),
    ...firma(ctx, "Atentamente"),
  ],

  LEG16: (ctx) => {
    const e = ctx.empresa;
    return [
      ...encabezado(LEG_TITULOS.LEG16, ctx),
      new Paragraph({
        children: [
          new TextRun(
            `${e.representante_legal_nombre}, en mi carácter de representante legal de la empresa ` +
              `${e.razon_social}, para dar cumplimiento a lo requerido en la ${contratacionTexto(ctx)}, ` +
              `declaro bajo protesta de decir verdad que mi representada está constituida conforme a ` +
              `las leyes mexicanas, con Registro Federal de Contribuyentes ${e.rfc}, y asimismo que, ` +
              `considerando los criterios (sector, número total de trabajadores y ventas anuales) ` +
              `establecidos en el Acuerdo por el que se establece la estratificación de las micro, ` +
              `pequeñas y medianas empresas, publicado en el Diario Oficial de la Federación el 30 de ` +
              `junio de 2009, mi representada se estratifica como una ${(e.estratificacion_mipyme ?? "").toUpperCase()}.`,
          ),
        ],
      }),
      new Paragraph({ text: "" }),
      new Paragraph({
        children: [
          new TextRun(
            "De igual forma, declaro que la presente manifestación la hago teniendo pleno conocimiento " +
              "de que la omisión, simulación o presentación de información falsa, son infracciones " +
              "previstas por las disposiciones aplicables.",
          ),
        ],
      }),
      ...firma(ctx, "Atentamente"),
    ];
  },

  LEG18: (ctx) => [
    ...encabezado(LEG_TITULOS.LEG18, ctx),
    new Paragraph({ children: introRepresentante(ctx) }),
    new Paragraph({ text: "" }),
    new Paragraph({
      children: [
        new TextRun(
          "Serán desechadas las proposiciones de los Licitantes que incurran en una o varias de las " +
            "siguientes situaciones:",
        ),
      ],
    }),
    new Paragraph({ text: "" }),
    ...[
      "Aquellos Licitantes que no cumplan con los requisitos expresados en el numeral 4.3 de esta Invitación, con excepción de los incisos d), l), m), n) y o).",
      "Cuando hayan enviado su proposición y al momento de su descarga, los documentos considerados INDISPENSABLES no puedan abrirse por tener algún virus informático o por cualquier otra causa ajena a la Convocante, tomándose como no presentadas.",
      'No presenten la documentación que avale la totalidad de los requisitos solicitados en el ANEXO "A" de esta Invitación.',
      'La descripción técnica y/o económica de la proposición del Licitante no contenga la totalidad de los servicios, especificaciones y requisitos solicitados en el Anexo "A", así como con aquellos que resulten de la Junta de Aclaraciones.',
      "Cuando el contenido de los requisitos considerados INDISPENSABLES no coincida con el contenido solicitado en el numeral 4.3 de la Invitación.",
      "Cuando no correspondan los servicios solicitados contra los servicios ofertados.",
      "La comprobación de que algún Licitante ha acordado con otro u otros participantes elevar los precios de los servicios o cualquier otro acuerdo que tenga como fin obtener una ventaja sobre los demás Licitantes.",
      "Si condicionan sus proposiciones.",
      "Si no presenta declaración de integridad.",
      "Si no presenta la manifestación de no encontrarse en alguno de los supuestos establecidos por los artículos 71 y 90 antepenúltimo párrafo de la Ley de Adquisiciones, Arrendamientos y Servicios del Sector Público, o bien, si se encuentran en alguno de los supuestos establecidos en dichos artículos.",
      "Si violan alguna disposición de los ordenamientos expresados en esta Invitación;",
      "Si resulta falsa la información o datos proporcionados por el Licitante y esta entidad convocante acredita dicha situación.",
      'Si no presentan su proposición con base a las características señaladas en el Anexo "A" de esta Invitación.',
      "Si las proposiciones no se encuentran firmadas digitalmente dentro de la Plataforma Compras MX, o bien, si de la verificación de la identidad que genera el sistema mencionado no indica que la firma digital es válida.",
      "Si no presentan alguno de los documentos señalados como INDISPENSABLES, o bien si al haberlos presentado, alguno de ellos no es legible, imposibilitando su análisis o bien, si no se encuentra requisitado.",
      "Si incumplen con alguno de los requisitos cuya omisión sea señalada como causa de desechamiento.",
      "Si no cumplen con algún requisito que afecte la solvencia de su proposición.",
      "Si los precios presentados en su proposición económica no resultan aceptables.",
      "La convocante podrá desechar una proposición debido a que los precios presentados sean determinados no convenientes.",
      'Si la proposición presentada no contempla la totalidad de los servicios solicitados en el Anexo "A".',
    ].map(
      (texto, i) =>
        new Paragraph({ children: [new TextRun(`${String.fromCharCode(97 + i)}. ${texto}`)] }),
    ),
    new Paragraph({ text: "" }),
    new Paragraph({
      children: [
        new TextRun(
          "Las condiciones que tengan como propósito facilitar la presentación de las proposiciones y " +
            "agilizar la conducción de los actos de la Invitación, así como cualquier otro requisito " +
            "cuyo incumplimiento, por sí mismo, o deficiencia en su contenido no afecte la solvencia de " +
            "las proposiciones, no serán objeto de evaluación, y se tendrán por no establecidas. La " +
            "inobservancia por parte de los Licitantes respecto a dichas condiciones o requisitos no " +
            "será motivo para desechar sus proposiciones.",
        ),
      ],
    }),
    ...firma(ctx),
  ],

  LEG19: (ctx) => {
    const e = ctx.empresa;
    return [
      ...encabezado(LEG_TITULOS.LEG19, ctx),
      new Paragraph({
        children: [
          new TextRun(
            `Me refiero a la ${contratacionTexto(ctx)}.`,
          ),
        ],
      }),
      new Paragraph({ text: "" }),
      new Paragraph({
        children: [
          new TextRun(
            `Sobre el particular, el suscrito, en mi carácter de representante legal, a nombre de la ` +
              `persona moral denominada ${e.razon_social}, manifiesto bajo protesta de decir verdad ` +
              `que, el que suscribe, la persona que represento, al igual que los socios y/o accionistas ` +
              `que ejercen control sobre la sociedad, no desempeñan empleo, cargo o comisión en el ` +
              `servicio público, motivo por el cual, con la formalización del instrumento jurídico ` +
              `señalado en el párrafo anterior, no se actualiza un conflicto de interés de conformidad ` +
              `con lo dispuesto por el artículo 49, fracción IX de la Ley General de Responsabilidades Administrativas.`,
          ),
        ],
      }),
      new Paragraph({ text: "" }),
      new Paragraph({
        children: [
          new TextRun(
            "En este sentido, hago de su conocimiento que los socios y/o accionistas que se mencionan " +
              "a continuación, conocen el contenido del artículo anteriormente referido:",
          ),
        ],
      }),
      new Paragraph({ text: "" }),
      ...e.socios_accionistas_json.map(
        (socio) => new Paragraph({ children: [new TextRun(socio)] }),
      ),
      new Paragraph({ text: "" }),
      new Paragraph({ children: [new TextRun("Lo anterior, para los efectos a que haya lugar.")] }),
      ...firma(ctx),
    ];
  },

  LEG22: (ctx) => [
    ...encabezado(LEG_TITULOS.LEG22, ctx),
    new Paragraph({
      children: [new TextRun(`Me refiero a la ${contratacionTexto(ctx)}.`)],
    }),
    new Paragraph({ text: "" }),
    new Paragraph({
      children: [
        new TextRun(
          `Sobre el particular, el suscrito, en mi carácter de representante legal, a nombre de la ` +
            `persona moral denominada ${ctx.empresa.razon_social}, manifiesto bajo protesta de decir ` +
            `verdad que, en caso de resultar ganadora, no podrá subcontratar a otro licitante que haya ` +
            `participado en el procedimiento.`,
        ),
      ],
    }),
    new Paragraph({ text: "" }),
    new Paragraph({ children: [new TextRun("Lo anterior, para los efectos a que haya lugar.")] }),
    ...firma(ctx),
  ],

  LEG27: (ctx) => [
    ...encabezado(LEG_TITULOS.LEG27, ctx),
    new Paragraph({
      children: [new TextRun(`Me refiero a la ${contratacionTexto(ctx)}.`)],
    }),
    new Paragraph({ text: "" }),
    new Paragraph({
      children: [
        new TextRun(
          `Sobre el particular, el suscrito, en mi carácter de representante legal, a nombre de la ` +
            `persona moral denominada ${ctx.empresa.razon_social}, manifiesto bajo protesta de decir ` +
            `verdad que este licitante no ejecuta con otro participante acciones que impliquen o tengan ` +
            `por objeto obtener un beneficio o ventaja indebida en el procedimiento.`,
        ),
      ],
    }),
    new Paragraph({ text: "" }),
    new Paragraph({ children: [new TextRun("Lo anterior, para los efectos a que haya lugar.")] }),
    ...firma(ctx),
  ],

  LEG15: (ctx) => {
    const e = ctx.empresa;
    const convocante = ctx.licitacion.institucion.toUpperCase();
    return [
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        alignment: AlignmentType.CENTER,
        children: [new TextRun(LEG_TITULOS.LEG15.toUpperCase())],
      }),
      new Paragraph({ text: "" }),
      new Paragraph({
        children: [
          new TextRun(
            `${convocante} (en lo sucesivo "la Convocante") y ${e.razon_social} (en lo sucesivo "el ` +
              `Licitante"), con relación a la ${contratacionTexto(ctx)}, asumen los siguientes compromisos con la transparencia:`,
          ),
        ],
      }),
      new Paragraph({ text: "" }),
      new Paragraph({ children: [new TextRun({ text: "I. Del Licitante", bold: true })] }),
      new Paragraph({
        children: [
          new TextRun(
            "Se compromete a no ofrecer ni dar sobornos a ningún servidor público de la Convocante a " +
              "cambio de obtener condiciones favorables en el presente procedimiento de contratación.",
          ),
        ],
      }),
      new Paragraph({ text: "" }),
      new Paragraph({ children: [new TextRun({ text: "II. De la Convocante", bold: true })] }),
      new Paragraph({
        children: [
          new TextRun(
            "Se compromete a que sus servidores públicos que intervengan en el presente procedimiento " +
              "de contratación se abstendrán de solicitar o recibir cualquier beneficio a cambio de " +
              "otorgar condiciones favorables al Licitante.",
          ),
        ],
      }),
      new Paragraph({ text: "" }),
      new Paragraph({
        children: [
          new TextRun(
            `El presente compromiso, que no genera derechos ni obligaciones distintos a los ya ` +
              `previstos en la normatividad aplicable, se firma en la Ciudad de México a ${formatFechaLarga(ctx.fecha ?? new Date())}.`,
          ),
        ],
      }),
      new Paragraph({ text: "" }),
      new Paragraph({ text: "" }),
      new Paragraph({
        children: [new TextRun({ text: `Por ${convocante}:`, bold: true })],
      }),
      new Paragraph({ text: "" }),
      new Paragraph({ text: "" }),
      new Paragraph({ children: [new TextRun(ctx.licitacion.convocante_representante_nombre ?? "")] }),
      new Paragraph({ children: [new TextRun(ctx.licitacion.convocante_representante_cargo || "Apoderado(a) Legal")] }),
      new Paragraph({ text: "" }),
      new Paragraph({ text: "" }),
      new Paragraph({
        children: [new TextRun({ text: "Por el Licitante:", bold: true })],
      }),
      new Paragraph({ text: "" }),
      new Paragraph({ text: "" }),
      new Paragraph({ children: [new TextRun(e.representante_legal_nombre ?? "")] }),
      new Paragraph({ children: [new TextRun("Representante Legal")] }),
      new Paragraph({ children: [new TextRun(e.razon_social ?? "")] }),
    ];
  },
};

export function generarDocumentoLegal(tipo: TipoDocumentoLegal, ctx: Ctx): Document {
  return new Document({
    sections: [{ children: LEG_TEMPLATES[tipo](ctx) }],
  });
}
