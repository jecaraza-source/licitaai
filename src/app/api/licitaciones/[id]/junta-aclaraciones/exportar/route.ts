import { NextResponse } from "next/server";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";
import { z } from "zod";
import { apiRoute, ApiError } from "@/lib/api";
import { getEmpresaPerfilActiva } from "@/lib/empresa-perfil";
import { sanitizeFilename } from "@/lib/utils";

interface Pregunta {
  texto: string;
  categoria: string;
  fundamento_legal?: string | null;
}

const paramsSchema = z.object({ id: z.string().uuid("id debe ser un UUID válido") });

export const POST = apiRoute({ paramsSchema }, async ({ ctx, params }) => {
  const { data: licitacion, error } = await ctx.supabase
    .from("licitaciones")
    .select("numero_expediente, titulo, institucion, organization_id")
    .eq("id", params.id)
    .maybeSingle();
  if (error || !licitacion) throw ApiError.notFound("Licitación no encontrada");

  const { data: junta } = await ctx.supabase
    .from("junta_aclaraciones")
    .select("preguntas_json")
    .eq("licitacion_id", params.id)
    .maybeSingle();

  const perfil = await getEmpresaPerfilActiva(ctx.supabase, licitacion.organization_id, ctx.userId, {
    fallbackToFirst: true,
  });

  const preguntas = (junta?.preguntas_json ?? []) as Pregunta[];

  const doc = new Document({
    sections: [
      {
        children: [
          ...(perfil?.razon_social
            ? [
                new Paragraph({
                  children: [new TextRun({ text: perfil.razon_social, bold: true, size: 24 })],
                }),
              ]
            : []),
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            children: [new TextRun("Preguntas para la Junta de Aclaraciones")],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: `Expediente: ${licitacion.numero_expediente}`, bold: true }),
            ],
          }),
          new Paragraph({ children: [new TextRun(licitacion.titulo)] }),
          new Paragraph({ children: [new TextRun(licitacion.institucion)] }),
          new Paragraph({ text: "" }),
          ...preguntas.flatMap((p, i) => [
            new Paragraph({
              children: [
                new TextRun({ text: `${i + 1}. `, bold: true }),
                new TextRun({ text: p.texto }),
              ],
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: `[${p.categoria}]${p.fundamento_legal ? ` — ${p.fundamento_legal}` : ""}`,
                  italics: true,
                  size: 18,
                  color: "666666",
                }),
              ],
            }),
            new Paragraph({ text: "" }),
          ]),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="junta-aclaraciones-${sanitizeFilename(licitacion.numero_expediente)}.docx"`,
    },
  });
});
