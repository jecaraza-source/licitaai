import { AlignmentType, HeadingLevel, Paragraph, TextRun } from "docx";

export const MODALIDAD_LABELS: Record<string, string> = {
  ABIERTA: "Licitación Pública",
  RESTRINGIDA: "Invitación Restringida",
  INVITACION_TRES: "Invitación a Cuando Menos Tres Personas",
};

export interface LicitacionEncabezado {
  numero_expediente: string;
  titulo: string;
  institucion: string;
  modalidad_procedimiento: string | null;
}

export interface EmpresaFirma {
  representante_legal_nombre: string | null;
  razon_social: string | null;
}

export interface CtxFormulario<L extends LicitacionEncabezado, E extends EmpresaFirma> {
  empresa: E;
  licitacion: L;
  fecha?: Date;
}

export function formatFechaLarga(fecha: Date): string {
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(fecha);
}

export function modalidadTexto<L extends LicitacionEncabezado>(ctx: { licitacion: L }): string {
  const { modalidad_procedimiento } = ctx.licitacion;
  return modalidad_procedimiento
    ? (MODALIDAD_LABELS[modalidad_procedimiento] ?? modalidad_procedimiento)
    : "procedimiento de contratación";
}

export function contratacionTexto<L extends LicitacionEncabezado>(ctx: { licitacion: L }): string {
  const { licitacion } = ctx;
  return `${modalidadTexto(ctx)} número ${licitacion.numero_expediente}, relativa a la CONTRATACIÓN DEL "${licitacion.titulo}"`;
}

export function encabezado<L extends LicitacionEncabezado, E extends EmpresaFirma>(
  tituloDocumento: string,
  ctx: CtxFormulario<L, E>,
): Paragraph[] {
  return [
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      alignment: AlignmentType.CENTER,
      children: [new TextRun(tituloDocumento.toUpperCase())],
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [new TextRun(`Ciudad de México, ${formatFechaLarga(ctx.fecha ?? new Date())}.`)],
    }),
    new Paragraph({ text: "" }),
    new Paragraph({ children: [new TextRun(ctx.licitacion.institucion)] }),
    new Paragraph({ children: [new TextRun("Presente.")] }),
    new Paragraph({ text: "" }),
  ];
}

export function introRepresentante<L extends LicitacionEncabezado, E extends EmpresaFirma>(
  ctx: CtxFormulario<L, E>,
): TextRun[] {
  return [
    new TextRun(
      `${ctx.empresa.representante_legal_nombre}, en mi carácter de representante legal de ` +
        `${ctx.empresa.razon_social}, de acuerdo con lo requerido en la ${contratacionTexto(ctx)}, ` +
        `manifiesto bajo protesta de decir verdad que:`,
    ),
  ];
}

export function firma<L extends LicitacionEncabezado, E extends EmpresaFirma>(
  ctx: CtxFormulario<L, E>,
  cierre = "PROTESTO LO NECESARIO",
): Paragraph[] {
  const { empresa } = ctx;
  return [
    new Paragraph({ text: "" }),
    new Paragraph({ children: [new TextRun({ text: cierre, bold: true })] }),
    new Paragraph({ text: "" }),
    new Paragraph({ text: "" }),
    new Paragraph({ children: [new TextRun(empresa.representante_legal_nombre ?? "")] }),
    new Paragraph({ children: [new TextRun("Representante Legal")] }),
    new Paragraph({ children: [new TextRun(empresa.razon_social ?? "")] }),
  ];
}
